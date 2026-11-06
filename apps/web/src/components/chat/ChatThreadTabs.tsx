import { useNavigate } from "@tanstack/react-router";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";

import { chatPaneTargetKey } from "../../chatPanesStore";
import { projectChatTabs, useChatTabsStore } from "../../chatTabsStore";
import { useComposerDraftStore } from "../../composerDraftStore";
import { cn } from "../../lib/utils";
import { useQuietThreadShell } from "../../state/entities";
import {
  buildDraftThreadRouteParams,
  buildThreadRouteParams,
  type ThreadRouteTarget,
} from "../../threadRoutes";

export function useProjectTabCount(projectKey: string | null): number {
  return useChatTabsStore((state) =>
    projectKey === null ? 0 : projectChatTabs(state, projectKey).length,
  );
}

/**
 * The project's open threads, in the header after the project name. `active` is the usual thread
 * crumb, so the active tab keeps its switcher menu and rename.
 */
export function ChatHeaderTabs({ projectKey, active }: { projectKey: string; active: ReactNode }) {
  const tabs = useChatTabsStore(useShallow((state) => projectChatTabs(state, projectKey)));
  const activeKey = useChatTabsStore((state) => state.activeByProject[projectKey] ?? null);
  const navigate = useNavigate();
  const open = (target: ThreadRouteTarget) =>
    void (target.kind === "server"
      ? navigate({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams(target.threadRef),
        })
      : navigate({ to: "/draft/$draftId", params: buildDraftThreadRouteParams(target.draftId) }));
  const close = (key: string) => {
    const focusTarget = useChatTabsStore.getState().close(key);
    if (focusTarget) open(focusTarget);
  };

  return (
    <div role="tablist" aria-label="Open threads" className="flex min-w-0 items-center gap-1">
      {tabs.map(({ target }) => {
        const key = chatPaneTargetKey(target);
        return key === activeKey ? (
          <div
            key={key}
            role="tab"
            aria-selected
            className="flex h-7 min-w-24 shrink items-center gap-1 rounded-md bg-accent ps-2 pe-1"
          >
            <div className="flex min-w-0 flex-1 items-center">{active}</div>
            <TabCloseButton label="Close tab" onClose={() => close(key)} />
          </div>
        ) : (
          <ChatThreadTab
            key={key}
            target={target}
            onSelect={() => open(target)}
            onClose={() => close(key)}
          />
        );
      })}
    </div>
  );
}

function ChatThreadTab({
  target,
  onSelect,
  onClose,
}: {
  target: ThreadRouteTarget;
  onSelect: () => void;
  onClose: () => void;
}) {
  const shell = useQuietThreadShell(target.kind === "server" ? target.threadRef : null);
  const draftExists = useComposerDraftStore((store) =>
    target.kind === "draft" ? store.getDraftSession(target.draftId) !== null : false,
  );
  // A deleted thread or a discarded draft has nothing to show.
  if (target.kind === "server" ? shell === null : !draftExists) return null;
  const title = (shell?.title ?? "").trim() || "New thread";
  return (
    <div className="group flex h-7 max-w-44 min-w-16 shrink items-center rounded-md text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground">
      <button
        type="button"
        role="tab"
        aria-selected={false}
        className="min-w-0 flex-1 truncate rounded-md py-1 ps-2 pe-1 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
        onClick={onSelect}
        onAuxClick={(event) => {
          if (event.button === 1) onClose();
        }}
      >
        {title}
      </button>
      <TabCloseButton
        label={`Close ${title}`}
        className="opacity-0 group-hover:opacity-70 focus-visible:opacity-70"
        onClose={onClose}
      />
    </div>
  );
}

function TabCloseButton({
  label,
  className,
  onClose,
}: {
  label: string;
  className?: string;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "me-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm opacity-70 hover:bg-foreground/10 hover:opacity-100",
        className,
      )}
      onClick={onClose}
    >
      <XIcon className="size-3.5" />
    </button>
  );
}
