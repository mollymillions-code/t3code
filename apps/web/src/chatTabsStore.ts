import { ScopedThreadRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { chatPaneTargetKey } from "./chatPanesStore";
import { resolveStorage } from "./lib/storage";
import type { ThreadRouteTarget } from "./threadRoutes";

/** Open thread tabs. The route shows the active tab, so switching tabs is a navigation. */
export interface ChatTabsState {
  readonly tabs: ReadonlyArray<ThreadRouteTarget>;
  readonly activeKey: string | null;
}

export const EMPTY_CHAT_TABS: ChatTabsState = { tabs: [], activeKey: null };

const keyOf = chatPaneTargetKey;

function insertAt<T>(items: ReadonlyArray<T>, index: number, item: T): T[] {
  return [...items.slice(0, index), item, ...items.slice(index)];
}

/**
 * Records the routed thread. An open tab becomes active; any other thread replaces the active
 * tab, like following a link, unless that tab is still on screen in another split pane.
 */
export function commitChatTab(
  state: ChatTabsState,
  routeTarget: ThreadRouteTarget,
  otherPaneKeys: ReadonlySet<string>,
): ChatTabsState {
  const key = keyOf(routeTarget);
  if (state.tabs.some((tab) => keyOf(tab) === key)) {
    return state.activeKey === key ? state : { ...state, activeKey: key };
  }
  const activeIndex = state.tabs.findIndex((tab) => keyOf(tab) === state.activeKey);
  if (activeIndex === -1 || otherPaneKeys.has(keyOf(state.tabs[activeIndex]!))) {
    return { tabs: [...state.tabs, routeTarget], activeKey: key };
  }
  return {
    tabs: state.tabs.map((tab, index) => (index === activeIndex ? routeTarget : tab)),
    activeKey: key,
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
): ChatTabsState {
  const originalKey = keyOf(original);
  const createdKey = keyOf(created);
  if (originalKey === createdKey) return state;
  const createdIndex = state.tabs.findIndex((tab) => keyOf(tab) === createdKey);
  const rest = state.tabs.filter((tab) => keyOf(tab) !== createdKey);
  const withOriginal = rest.some((tab) => keyOf(tab) === originalKey)
    ? rest
    : insertAt(rest, createdIndex === -1 ? rest.length : createdIndex, original);
  const after = withOriginal.findIndex((tab) => keyOf(tab) === originalKey) + 1;
  return { tabs: insertAt(withOriginal, after, created), activeKey: createdKey };
}

/** Closes a tab. Closing the active one activates its right neighbour, else its left one. */
export function closeChatTab(
  state: ChatTabsState,
  key: string,
): { readonly state: ChatTabsState; readonly focusTarget: ThreadRouteTarget | null } {
  const index = state.tabs.findIndex((tab) => keyOf(tab) === key);
  if (index === -1) return { state, focusTarget: null };
  const tabs = state.tabs.filter((_, tabIndex) => tabIndex !== index);
  if (state.activeKey !== key) return { state: { ...state, tabs }, focusTarget: null };
  const focusTarget = tabs[index] ?? tabs[index - 1] ?? null;
  return {
    state: { tabs, activeKey: focusTarget ? keyOf(focusTarget) : null },
    focusTarget,
  };
}

interface ChatTabsStore extends ChatTabsState {
  readonly commit: (routeTarget: ThreadRouteTarget, otherPaneKeys: ReadonlySet<string>) => void;
  readonly openAfter: (original: ThreadRouteTarget, created: ThreadRouteTarget) => void;
  /** Returns the thread to navigate to when the active tab closed. */
  readonly close: (key: string) => ThreadRouteTarget | null;
}

const isThreadRef = Schema.is(ScopedThreadRef);

function isServerTab(tab: unknown): tab is Extract<ThreadRouteTarget, { kind: "server" }> {
  const target = tab as { kind?: unknown; threadRef?: unknown } | null;
  return target?.kind === "server" && isThreadRef(target.threadRef);
}

const pick = ({ tabs, activeKey }: ChatTabsState): ChatTabsState => ({ tabs, activeKey });

export const useChatTabsStore = create<ChatTabsStore>()(
  persist(
    (set, get) => ({
      ...EMPTY_CHAT_TABS,
      commit: (routeTarget, otherPaneKeys) =>
        set((state) => {
          const next = commitChatTab(pick(state), routeTarget, otherPaneKeys);
          return next.tabs === state.tabs && next.activeKey === state.activeKey ? state : next;
        }),
      openAfter: (original, created) =>
        set((state) => openChatTabAfter(pick(state), original, created)),
      close: (key) => {
        const result = closeChatTab(pick(get()), key);
        set(result.state);
        return result.focusTarget;
      },
    }),
    {
      name: "t3code:chat-tabs:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      // Drafts live in the composer draft store; a reopened app keeps only real threads.
      partialize: ({ tabs, activeKey }) => ({ tabs: tabs.filter(isServerTab), activeKey }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<ChatTabsState> | null;
        return {
          ...current,
          tabs: Array.isArray(saved?.tabs) ? saved.tabs.filter(isServerTab) : [],
          activeKey: typeof saved?.activeKey === "string" ? saved.activeKey : null,
        };
      },
    },
  ),
);
