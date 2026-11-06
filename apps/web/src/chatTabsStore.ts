import { ScopedThreadRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { chatPaneTargetKey } from "./chatPanesStore";
import { resolveStorage } from "./lib/storage";
import type { ThreadRouteTarget } from "./threadRoutes";

export interface ChatTab {
  readonly target: ThreadRouteTarget;
  /** `scopedProjectKey` of the thread's project; each project shows only its own tabs. */
  readonly projectKey: string;
}

/** Open thread tabs per project. The route shows the active tab, so switching is a navigation. */
export interface ChatTabsState {
  readonly tabs: ReadonlyArray<ChatTab>;
  readonly activeByProject: Readonly<Record<string, string>>;
}

export const EMPTY_CHAT_TABS: ChatTabsState = { tabs: [], activeByProject: {} };

const keyOf = (tab: ChatTab) => chatPaneTargetKey(tab.target);

function insertAt<T>(items: ReadonlyArray<T>, index: number, item: T): T[] {
  return [...items.slice(0, index), item, ...items.slice(index)];
}

export function projectChatTabs(state: ChatTabsState, projectKey: string): ReadonlyArray<ChatTab> {
  return state.tabs.filter((tab) => tab.projectKey === projectKey);
}

/** The threads open as tabs in the project of the tab on screen. */
export function siblingTabThreadRefs(
  state: ChatTabsState,
  routeTarget: ThreadRouteTarget | null,
): ScopedThreadRef[] {
  const routeKey = routeTarget === null ? null : chatPaneTargetKey(routeTarget);
  const projectKey = state.tabs.find((tab) => keyOf(tab) === routeKey)?.projectKey;
  if (projectKey === undefined) return [];
  return projectChatTabs(state, projectKey).flatMap((tab) =>
    tab.target.kind === "server" ? [tab.target.threadRef] : [],
  );
}

/**
 * Records the routed thread. An open tab becomes its project's active tab; any other thread
 * replaces that project's active tab, like following a link, unless the tab is still on screen
 * in another split pane. Other projects' tabs are left alone.
 */
export function commitChatTab(
  state: ChatTabsState,
  routeTarget: ThreadRouteTarget,
  projectKey: string,
  otherPaneKeys: ReadonlySet<string>,
): ChatTabsState {
  const key = chatPaneTargetKey(routeTarget);
  const activeByProject = { ...state.activeByProject, [projectKey]: key };
  if (state.tabs.some((tab) => keyOf(tab) === key)) {
    return state.activeByProject[projectKey] === key ? state : { ...state, activeByProject };
  }
  const activeKey = state.activeByProject[projectKey];
  const activeIndex = state.tabs.findIndex(
    (tab) => tab.projectKey === projectKey && keyOf(tab) === activeKey,
  );
  const tab = { target: routeTarget, projectKey };
  if (activeIndex === -1 || otherPaneKeys.has(keyOf(state.tabs[activeIndex]!))) {
    return { tabs: [...state.tabs, tab], activeByProject };
  }
  return {
    tabs: state.tabs.map((existing, index) => (index === activeIndex ? tab : existing)),
    activeByProject,
  };
}

/**
 * Keeps `original` open and puts `created` in a new tab right after it. Works whether or not the
 * route commit for `created` already replaced `original`.
 */
export function openChatTabAfter(
  state: ChatTabsState,
  original: ThreadRouteTarget,
  created: ThreadRouteTarget,
  projectKey: string,
): ChatTabsState {
  const originalKey = chatPaneTargetKey(original);
  const createdKey = chatPaneTargetKey(created);
  if (originalKey === createdKey) return state;
  const createdIndex = state.tabs.findIndex((tab) => keyOf(tab) === createdKey);
  const rest = state.tabs.filter((tab) => keyOf(tab) !== createdKey);
  const withOriginal = rest.some((tab) => keyOf(tab) === originalKey)
    ? rest
    : insertAt(rest, createdIndex === -1 ? rest.length : createdIndex, {
        target: original,
        projectKey,
      });
  const after = withOriginal.findIndex((tab) => keyOf(tab) === originalKey) + 1;
  return {
    tabs: insertAt(withOriginal, after, { target: created, projectKey }),
    activeByProject: { ...state.activeByProject, [projectKey]: createdKey },
  };
}

/** Closes a tab. Closing the active one activates its right neighbour in the project, else its left. */
export function closeChatTab(
  state: ChatTabsState,
  key: string,
): { readonly state: ChatTabsState; readonly focusTarget: ThreadRouteTarget | null } {
  const closing = state.tabs.find((tab) => keyOf(tab) === key);
  if (!closing) return { state, focusTarget: null };
  const siblings = projectChatTabs(state, closing.projectKey);
  const index = siblings.indexOf(closing);
  const tabs = state.tabs.filter((tab) => tab !== closing);
  if (state.activeByProject[closing.projectKey] !== key) {
    return { state: { ...state, tabs }, focusTarget: null };
  }
  const next = siblings[index + 1] ?? siblings[index - 1] ?? null;
  const { [closing.projectKey]: _closed, ...others } = state.activeByProject;
  return {
    state: {
      tabs,
      activeByProject: next ? { ...others, [closing.projectKey]: keyOf(next) } : others,
    },
    focusTarget: next?.target ?? null,
  };
}

interface ChatTabsStore extends ChatTabsState {
  readonly commit: (
    routeTarget: ThreadRouteTarget,
    projectKey: string,
    otherPaneKeys: ReadonlySet<string>,
  ) => void;
  readonly openAfter: (
    original: ThreadRouteTarget,
    created: ThreadRouteTarget,
    projectKey: string,
  ) => void;
  /** Returns the thread to navigate to when the active tab closed. */
  readonly close: (key: string) => ThreadRouteTarget | null;
}

const isThreadRef = Schema.is(ScopedThreadRef);

function isServerTab(tab: unknown): tab is ChatTab {
  const candidate = tab as {
    target?: { kind?: unknown; threadRef?: unknown };
    projectKey?: unknown;
  };
  return (
    typeof candidate?.projectKey === "string" &&
    candidate.target?.kind === "server" &&
    isThreadRef(candidate.target.threadRef)
  );
}

const pick = ({ tabs, activeByProject }: ChatTabsState): ChatTabsState => ({
  tabs,
  activeByProject,
});

export const useChatTabsStore = create<ChatTabsStore>()(
  persist(
    (set, get) => ({
      ...EMPTY_CHAT_TABS,
      commit: (routeTarget, projectKey, otherPaneKeys) =>
        set((state) => {
          const next = commitChatTab(pick(state), routeTarget, projectKey, otherPaneKeys);
          return next.tabs === state.tabs && next.activeByProject === state.activeByProject
            ? state
            : next;
        }),
      openAfter: (original, created, projectKey) =>
        set((state) => openChatTabAfter(pick(state), original, created, projectKey)),
      close: (key) => {
        const result = closeChatTab(pick(get()), key);
        set(result.state);
        return result.focusTarget;
      },
    }),
    {
      name: "t3code:chat-tabs:v2",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      // Drafts live in the composer draft store; a reopened app keeps only real threads.
      partialize: ({ tabs, activeByProject }) => ({
        tabs: tabs.filter(isServerTab),
        activeByProject,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<ChatTabsState> | null;
        const activeByProject = Object.fromEntries(
          Object.entries(saved?.activeByProject ?? {}).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        );
        return {
          ...current,
          tabs: Array.isArray(saved?.tabs) ? saved.tabs.filter(isServerTab) : [],
          activeByProject,
        };
      },
    },
  ),
);
