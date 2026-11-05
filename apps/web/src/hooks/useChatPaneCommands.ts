import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { type AnyRouter, useRouter } from "@tanstack/react-router";

import { isChatSplitOpen, useChatPanesStore } from "../chatPanesStore";
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

  /** Opens `threadRef` beside the routed thread and focuses it; false with no thread routed. */
  const openInSplit = (threadRef: ScopedThreadRef): boolean => {
    const routeTarget = resolveThreadRouteTarget(router.state.matches.at(-1)?.params ?? {});
    if (routeTarget === null) return false;
    useChatPanesStore.getState().openSplit({ routeTarget, target: { kind: "server", threadRef } });
    navigateTo({ kind: "server", threadRef });
    return true;
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

  return { openInSplit, closePaneShowing };
}

export function useChatPaneCommands() {
  return createChatPaneCommands(useRouter());
}
