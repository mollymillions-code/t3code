import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  closeChatTab,
  commitChatTab,
  EMPTY_CHAT_TABS,
  openChatTabAfter,
  projectChatTabs,
  siblingTabThreadRefs,
  type ChatTabsState,
} from "./chatTabsStore";
import { DraftId } from "./composerDraftStore";
import type { ThreadRouteTarget } from "./threadRoutes";

const ref = (id: string) => scopeThreadRef(EnvironmentId.make("env"), ThreadId.make(id));
const thread = (id: string): ThreadRouteTarget => ({ kind: "server", threadRef: ref(id) });
const draft = (id: string): ThreadRouteTarget => ({ kind: "draft", draftId: DraftId.make(id) });
const key = (target: ThreadRouteTarget) =>
  target.kind === "server" ? `env:${target.threadRef.threadId}` : `draft:${target.draftId}`;
const none = new Set<string>();

const names = (state: ChatTabsState, project = "p") =>
  projectChatTabs(state, project).map(({ target }) =>
    target.kind === "server" ? target.threadRef.threadId : target.draftId,
  );

/** Tabs opened one after another in project `p`, the last one active. */
function tabs(...targets: ThreadRouteTarget[]): ChatTabsState {
  return targets.reduce<ChatTabsState>(
    (state, target) =>
      state.tabs.length === 0
        ? commitChatTab(state, target, "p", none)
        : openChatTabAfter(state, state.tabs.at(-1)!.target, target, "p"),
    EMPTY_CHAT_TABS,
  );
}

describe("chat tabs", () => {
  it("replaces the project's active tab when the route moves to an unopened thread", () => {
    const state = commitChatTab(tabs(thread("a"), thread("b")), thread("c"), "p", none);
    expect(names(state)).toEqual(["a", "c"]);
    expect(state.activeByProject.p).toBe(key(thread("c")));
  });

  it("keeps each project's tabs apart", () => {
    const state = commitChatTab(tabs(thread("a"), thread("b")), thread("x"), "q", none);
    expect(names(state)).toEqual(["a", "b"]);
    expect(names(state, "q")).toEqual(["x"]);
    expect(state.activeByProject).toEqual({ p: key(thread("b")), q: key(thread("x")) });
    expect(siblingTabThreadRefs(state, thread("b"))).toEqual([ref("a"), ref("b")]);
    expect(siblingTabThreadRefs(state, thread("x"))).toEqual([ref("x")]);
    expect(siblingTabThreadRefs(state, thread("closed"))).toEqual([]);
  });

  it("activates an open tab instead of opening it twice", () => {
    const state = commitChatTab(tabs(thread("a"), thread("b")), thread("a"), "p", none);
    expect(names(state)).toEqual(["a", "b"]);
    expect(state.activeByProject.p).toBe(key(thread("a")));
  });

  it("adds a tab when the active one is still shown in the other split pane", () => {
    const state = commitChatTab(tabs(thread("a")), thread("b"), "p", new Set([key(thread("a"))]));
    expect(names(state)).toEqual(["a", "b"]);
  });

  it("opens a new thread after the original whether or not the route commit ran first", () => {
    const start = tabs(thread("a"), thread("b"));
    const committedFirst = openChatTabAfter(
      commitChatTab(start, draft("new"), "p", none),
      thread("b"),
      draft("new"),
      "p",
    );
    const openedFirst = openChatTabAfter(start, thread("b"), draft("new"), "p");
    expect(names(committedFirst)).toEqual(["a", "b", "new"]);
    expect(names(commitChatTab(openedFirst, draft("new"), "p", none))).toEqual(["a", "b", "new"]);
    expect(committedFirst.activeByProject.p).toBe(key(draft("new")));
  });

  it("promotes a sent draft in place", () => {
    const state = commitChatTab(tabs(thread("a"), draft("new")), thread("sent"), "p", none);
    expect(names(state)).toEqual(["a", "sent"]);
  });

  it("closing the active tab focuses its right neighbour in the project, else its left one", () => {
    const start = commitChatTab(
      commitChatTab(tabs(thread("a"), thread("b"), thread("c")), thread("x"), "q", none),
      thread("b"),
      "p",
      none,
    );
    const middle = closeChatTab(start, key(thread("b")));
    expect(names(middle.state)).toEqual(["a", "c"]);
    expect(middle.focusTarget).toEqual(thread("c"));
    const last = closeChatTab(middle.state, key(thread("c")));
    expect(last.focusTarget).toEqual(thread("a"));
    expect(names(last.state, "q")).toEqual(["x"]);
    expect(closeChatTab(last.state, "env:missing").focusTarget).toBeNull();
  });
});
