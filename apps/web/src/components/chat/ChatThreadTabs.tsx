import { useNavigate } from "@tanstack/react-router";
import { PlusIcon, XIcon } from "lucide-react";

import { chatPaneTargetKey } from "../../chatPanesStore";
import { useChatTabsStore } from "../../chatTabsStore";
import { useComposerDraftStore } from "../../composerDraftStore";
import { cn } from "../../lib/utils";
import { useQuietThreadShell } from "../../state/entities";
import {
  buildDraftThreadRouteParams,
  buildThreadRouteParams,
  type ThreadRouteTarget,
} from "../../threadRoutes";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** Open thread tabs. Shown once a second tab is open, so one thread looks as it always did. */
export function ChatThreadTabs({ onNewTab }: { onNewTab: () => void }) {
  const tabs = useChatTabsStore((state) => state.tabs);
  const activeKey = useChatTabsStore((state) => state.activeKey);
  const navigate = useNavigate();
  if (tabs.length < 2) return null;

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
    <div
      role="tablist"
      aria-label="Open threads"
      className="flex h-8 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-2"
    >
      {tabs.map((target) => {
        const key = chatPaneTargetKey(target);
        return (
          <ChatThreadTab
            key={key}
            target={target}
            active={key === activeKey}
            onSelect={() => open(target)}
            onClose={() => close(key)}
          />
        );
      })}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost-muted"
              size="icon-xs"
              aria-label="New tab"
              className="ms-0.5 shrink-0"
              onClick={onNewTab}
            />
          }
        >
          <PlusIcon />
        </TooltipTrigger>
        <TooltipPopup side="bottom">New tab</TooltipPopup>
      </Tooltip>
    </div>
  );
}

function ChatThreadTab({
  target,
  active,
  onSelect,
  onClose,
}: {
  target: ThreadRouteTarget;
  active: boolean;
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
    <div
      className={cn(
        "group flex h-6 max-w-48 min-w-0 shrink-0 items-center rounded-md text-xs",
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        className="min-w-0 truncate py-1 ps-2 pe-1 outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset rounded-md"
        onClick={onSelect}
        onAuxClick={(event) => {
          if (event.button === 1) onClose();
        }}
      >
        {title}
      </button>
      <button
        type="button"
        aria-label={`Close ${title}`}
        className={cn(
          "me-1 flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-foreground/10",
          active ? "opacity-70" : "opacity-0 group-hover:opacity-70 focus-visible:opacity-70",
        )}
        onClick={onClose}
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}
