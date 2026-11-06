import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  closeChatTab,
  commitChatTab,
  EMPTY_CHAT_TABS,
  openChatTabAfter,
  type ChatTabsState,
} from "./chatTabsStore";
import { DraftId } from "./composerDraftStore";
import type { ThreadRouteTarget } from "./threadRoutes";

const thread = (id: string): ThreadRouteTarget => ({
  kind: "server",
  threadRef: scopeThreadRef(EnvironmentId.make("env"), ThreadId.make(id)),
});
const draft = (id: string): ThreadRouteTarget => ({ kind: "draft", draftId: DraftId.make(id) });
const key = (target: ThreadRouteTarget) =>
  target.kind === "server" ? `env:${target.threadRef.threadId}` : `draft:${target.draftId}`;

const names = (state: ChatTabsState) =>
  state.tabs.map((tab) => (tab.kind === "server" ? tab.threadRef.threadId : tab.draftId));
const none = new Set<string>();

function tabs(...targets: ThreadRouteTarget[]): ChatTabsState {
  return targets.reduce<ChatTabsState>(
    (state, target) => openChatTabAfter(state, state.tabs.at(-1) ?? target, target),
    {
      ...EMPTY_CHAT_TABS,
      tabs: targets.slice(0, 1),
      activeKey: targets[0] ? key(targets[0]) : null,
    },
  );
}

describe("chat tabs", () => {
  it("replaces the active tab when the route moves to an unopened thread", () => {
    const state = commitChatTab(tabs(thread("a"), thread("b")), thread("c"), none);
    expect(names(state)).toEqual(["a", "c"]);
    expect(state.activeKey).toBe(key(thread("c")));
  });

  it("activates an open tab instead of opening it twice", () => {
    const state = commitChatTab(tabs(thread("a"), thread("b")), thread("a"), none);
    expect(names(state)).toEqual(["a", "b"]);
    expect(state.activeKey).toBe(key(thread("a")));
  });

  it("adds a tab when the active one is still shown in the other split pane", () => {
    const state = commitChatTab(tabs(thread("a")), thread("b"), new Set([key(thread("a"))]));
    expect(names(state)).toEqual(["a", "b"]);
  });

  it("opens a new thread after the original whether or not the route commit ran first", () => {
    const start = tabs(thread("a"), thread("b"));
    const committedFirst = openChatTabAfter(
      commitChatTab(start, draft("new"), none),
      thread("b"),
      draft("new"),
    );
    const openedFirst = openChatTabAfter(start, thread("b"), draft("new"));
    expect(names(committedFirst)).toEqual(["a", "b", "new"]);
    expect(names(commitChatTab(openedFirst, draft("new"), none))).toEqual(["a", "b", "new"]);
    expect(committedFirst.activeKey).toBe(key(draft("new")));
  });

  it("promotes a sent draft in place", () => {
    const state = commitChatTab(tabs(thread("a"), draft("new")), thread("sent"), none);
    expect(names(state)).toEqual(["a", "sent"]);
  });

  it("closing the active tab focuses its right neighbour, else its left one", () => {
    const start = commitChatTab(tabs(thread("a"), thread("b"), thread("c")), thread("b"), none);
    const middle = closeChatTab(start, key(thread("b")));
    expect(names(middle.state)).toEqual(["a", "c"]);
    expect(middle.focusTarget).toEqual(thread("c"));
    const last = closeChatTab(middle.state, key(thread("c")));
    expect(last.focusTarget).toEqual(thread("a"));
    const inactive = closeChatTab(last.state, "env:missing");
    expect(inactive.focusTarget).toBeNull();
  });
});
