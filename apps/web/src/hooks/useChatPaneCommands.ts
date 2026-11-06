import {
  scopedProjectKey,
  scopedThreadKey,
  scopeProjectRef,
} from "@t3tools/client-runtime/environment";
import type { ScopedProjectRef, ScopedThreadRef } from "@t3tools/contracts";
import { type AnyRouter, useRouter } from "@tanstack/react-router";

import {
  chatPaneTargetKey,
  isChatSplitOpen,
  useChatPanesStore,
  type ChatSplitDirection,
} from "../chatPanesStore";
import { useChatTabsStore } from "../chatTabsStore";
import { readThreadShell } from "../state/entities";
import {
  buildDraftThreadRouteParams,
  buildThreadRouteParams,
  resolveThreadRouteTarget,
  type ThreadRouteTarget,
} from "../threadRoutes";

/**
 * Split pane actions for code outside the panes, such as the sidebar and thread actions. The
 * route shows the focused pane, so each focus change is a navigation.
 */
export function createChatPaneCommands(router: AnyRouter) {
  const navigateTo = (target: ThreadRouteTarget) =>
    void (target.kind === "server"
      ? router.navigate({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams(target.threadRef),
        })
      : router.navigate({
          to: "/draft/$draftId",
          params: buildDraftThreadRouteParams(target.draftId),
        }));

  const readRouteTarget = () => resolveThreadRouteTarget(router.state.matches.at(-1)?.params ?? {});

  /** Opens `threadRef` beside the routed thread and focuses it; false with no thread routed. */
  const openInSplit = (threadRef: ScopedThreadRef, direction: ChatSplitDirection): boolean => {
    const routeTarget = readRouteTarget();
    if (routeTarget === null) return false;
    useChatPanesStore
      .getState()
      .openSplit({ routeTarget, target: { kind: "server", threadRef }, direction });
    navigateTo({ kind: "server", threadRef });
    return true;
  };

  /** Starts a thread in `projectRef` and shows it beside the routed thread. */
  const splitWithNewThread = async (
    projectRef: ScopedProjectRef,
    direction: ChatSplitDirection,
    newThread: (projectRef: ScopedProjectRef) => Promise<unknown>,
  ): Promise<void> => {
    const routeTarget = readRouteTarget();
    if (routeTarget === null) return;
    // Creating the thread navigates to it, which the split then shows beside the original.
    await newThread(projectRef);
    const created = readRouteTarget();
    // A project keeps one empty draft, so from it nothing new opens; an open split still turns.
    const target =
      created === null || chatPaneTargetKey(created) === chatPaneTargetKey(routeTarget)
        ? routeTarget
        : created;
    useChatPanesStore.getState().openSplit({ routeTarget, target, direction });
  };

  /**
   * Splits from a thread's menu. The routed thread splits off a new thread in its project;
   * any other thread opens beside the routed one.
   */
  const splitFromThread = async (
    threadRef: ScopedThreadRef,
    direction: ChatSplitDirection,
    newThread: (projectRef: ScopedProjectRef) => Promise<unknown>,
  ): Promise<void> => {
    const routeTarget = readRouteTarget();
    if (routeTarget === null) return;
    const routed =
      routeTarget.kind === "server" &&
      scopedThreadKey(routeTarget.threadRef) === scopedThreadKey(threadRef);
    if (!routed) {
      openInSplit(threadRef, direction);
      return;
    }
    const thread = readThreadShell(threadRef);
    if (!thread) return;
    await splitWithNewThread(
      scopeProjectRef(thread.environmentId, thread.projectId),
      direction,
      newThread,
    );
  };

  /** Starts a thread in a new tab after the routed one, which stays open. */
  const newThreadInTab = async (
    projectRef: ScopedProjectRef,
    newThread: (projectRef: ScopedProjectRef) => Promise<unknown>,
  ): Promise<void> => {
    const original = readRouteTarget();
    await newThread(projectRef);
    const created = readRouteTarget();
    if (original !== null && created !== null) {
      useChatTabsStore.getState().openAfter(original, created, scopedProjectKey(projectRef));
    }
  };

  /**
   * Closes the pane showing a thread that is gone. True when that moved focus to the other pane,
   * so the caller skips its own fallback navigation.
   */
  const closePaneShowing = (threadRef: ScopedThreadRef): boolean => {
    const store = useChatPanesStore.getState();
    if (!isChatSplitOpen(store.layout)) return false;
    const key = scopedThreadKey(threadRef);
    const pane = store.layout.panes.find(
      (candidate) =>
        candidate.target.kind === "server" && scopedThreadKey(candidate.target.threadRef) === key,
    );
    if (!pane) return false;
    const focusTarget = store.closePane(pane.id);
    if (focusTarget) navigateTo(focusTarget);
    return focusTarget !== null;
  };

  return { openInSplit, splitFromThread, splitWithNewThread, newThreadInTab, closePaneShowing };
}

export function useChatPaneCommands() {
  return createChatPaneCommands(useRouter());
}
