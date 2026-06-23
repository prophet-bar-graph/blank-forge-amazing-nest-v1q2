"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useChatHistory } from "@/components/ChatHistoryProvider";
import {
  PenSquare,
  Wand2,
  Pencil,
  GitBranch,
  FileText,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

function relativeTime(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const min = Math.floor((Date.now() - then) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

const SOURCE_META: Record<string, { label: string; Icon: typeof PenSquare }> = {
  compose: { label: "Composed", Icon: PenSquare },
  refine: { label: "Refined", Icon: Wand2 },
  override: { label: "Edited", Icon: Pencil },
  draft: { label: "Your draft", Icon: FileText },
};

interface VersionHistoryProps {
  // Load a version by index into Refine.
  onSelectVersion: (index: number) => void;
  // Delete a version by index.
  onDeleteVersion: (index: number) => void;
}

export function VersionHistory({
  onSelectVersion,
  onDeleteVersion,
}: VersionHistoryProps) {
  const { activeChat, activeVersionIndex } = useChatHistory();
  const versions = activeChat?.versions ?? [];
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Show edge fades only when there's content scrolled off that side.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const updateFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftFade(el.scrollLeft > 1);
    setShowRightFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);
  useEffect(() => {
    updateFades();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(updateFades);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateFades, versions.length]);

  // The bar is pinned to the viewport bottom (position: fixed), so it's out of
  // flow — measure its height and render an equal-height spacer in flow so the
  // page can scroll its last content clear of the bar.
  const barRef = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(0);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBarHeight(el.offsetHeight));
    ro.observe(el);
    setBarHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, [versions.length]);

  // Nothing to show until a chat has at least one saved version.
  if (!activeChat || versions.length === 0) return null;

  return (
    <>
      <div aria-hidden style={{ height: barHeight }} />
      <div
        ref={barRef}
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-studio-border bg-studio-cardSubtle"
      >
        <div className="max-w-[1400px] mx-auto px-2 py-3">
          <div className="flex items-center gap-2 mb-2.5">
            <GitBranch className="h-3.5 w-3.5 text-studio-mutedSoft" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-studio-mutedSoft">
              Edit history
            </h2>
            <span className="text-xs text-studio-mutedSoft/70">
              · {activeChat.title}
            </span>
          </div>

          <div className="relative">
            <div
              ref={scrollRef}
              onScroll={updateFades}
              className="flex items-stretch gap-0 overflow-x-auto pb-1"
            >
              {versions.map((v: any, i: number) => {
                const meta =
                  SOURCE_META[v.source as string] ?? SOURCE_META.refine;
                const Icon = meta.Icon;
                const isCurrent = i === activeVersionIndex;
                // Versions newer than the loaded one would be discarded if the user
                // saves from the current (earlier) version — dim them as a hint.
                const isFuture =
                  activeVersionIndex != null && i > activeVersionIndex;
                const overall =
                  v.scores && typeof v.scores === "object"
                    ? Math.round(
                        (Number(v.scores.voice) +
                          Number(v.scores.messaging) +
                          Number(v.scores.strategy)) /
                          3,
                      )
                    : null;
                return (
                  <div key={i} className="flex items-center flex-shrink-0">
                    {/* connector line (not before the first node) */}
                    {i > 0 && (
                      <div
                        className={`h-px w-6 ${isFuture ? "bg-studio-border/50" : "bg-studio-border"}`}
                      />
                    )}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => onSelectVersion(i)}
                        title={`${meta.label}${overall != null ? ` · ${overall}/100` : ""} · ${relativeTime(v.createdAt)}`}
                        className={`group flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                          isCurrent
                            ? "border-studio-ink bg-studio-page pr-12"
                            : "border-studio-border bg-studio-page hover:border-studio-ink/40"
                        } ${isFuture ? "opacity-50" : ""}`}
                      >
                        <span
                          className={`flex items-center justify-center h-6 w-6 rounded-full flex-shrink-0 ${
                            isCurrent
                              ? "bg-studio-ink text-studio-page"
                              : "bg-studio-card text-studio-muted"
                          }`}
                        >
                          <Icon className="h-3 w-3" />
                        </span>
                        <span className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-studio-ink leading-tight">
                            v{i + 1} · {meta.label}
                            {isCurrent && (
                              <span className="text-studio-mutedSoft font-normal">
                                {" "}
                                (current)
                              </span>
                            )}
                          </span>
                          <span className="text-[11px] text-studio-mutedSoft leading-tight">
                            {overall != null ? `${overall}/100 · ` : ""}
                            {relativeTime(v.createdAt)}
                          </span>
                        </span>
                      </button>
                      {/* Delete only the current node (with a confirm modal). The
                      hit area is the right 20% of the node, vertically centered. */}
                      {isCurrent && (
                        <button
                          type="button"
                          aria-label="Delete this version"
                          title="Delete this version"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteOpen(true);
                          }}
                          className="absolute inset-y-0 right-0 w-1/5 min-w-[2rem] flex items-center justify-center rounded-r-lg text-studio-mutedSoft hover:text-studio-scoreRed hover:bg-studio-scoreRed/5 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {showLeftFade && (
              <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-studio-cardSubtle to-transparent" />
            )}
            {showRightFade && (
              <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-studio-cardSubtle to-transparent" />
            )}
          </div>
        </div>
      </div>

      {/* Confirm deleting the current version. */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent className="bg-studio-page border-studio-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-studio-ink">
              Delete this version?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-studio-muted">
              {activeVersionIndex != null && (
                <>
                  This permanently removes version {activeVersionIndex + 1} from
                  this chat&rsquo;s history.{" "}
                  {versions.length === 1
                    ? "It's the only version, so the chat will be removed too."
                    : "This can't be undone."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-0 bg-transparent shadow-none text-studio-mutedSoft hover:bg-studio-cardSubtle hover:text-studio-ink">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDeleteOpen(false);
                if (activeVersionIndex != null)
                  onDeleteVersion(activeVersionIndex);
              }}
              className="bg-studio-scoreRed/90 hover:bg-studio-scoreRed text-studio-page"
            >
              Delete version
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
