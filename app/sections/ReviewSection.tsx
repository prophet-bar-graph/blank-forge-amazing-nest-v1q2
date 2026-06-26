"use client";

import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  ArrowRight,
  AlertCircle,
  Check,
  ChevronDown,
  Lightbulb,
  BadgeCheck,
  Pencil,
  Save,
  Copy as CopyIcon,
  Undo2,
} from "lucide-react";
import { diffWords, diffChangeRatio, type DiffSegment } from "@/lib/diff";
import { lensScore, overallScore, scoreColorClass } from "@/lib/brandScore";
import { stripMarkdown, markdownToHtml } from "@/lib/markdown";
import { copyRichText } from "@/lib/clipboard";
import { ChatHistory, type ChatVersion } from "@/lib/chatHistory";
import LoadingWords from "@/components/LoadingWords";
import { useBrandProfile } from "@/components/BrandProfileProvider";
import { useChatHistory } from "@/components/ChatHistoryProvider";
import { MarkdownText } from "@/components/MarkdownText";
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
import { emptyBrandProfile } from "@/lib/brandProfile";
import { buildBrandContextBlock } from "@/lib/brandContextPrompt";
import { StepEyebrow } from "@/components/StepEyebrow";
import { CHANNELS } from "@/lib/channels";

const REFINE_LOADING_WORDS = [
  "Reading",
  "Weighing",
  "Anchoring",
  "Refining",
  "Polishing",
  "Sharpening",
  "Aligning",
  "Distilling",
  "Reframing",
];

// ---- Parsing helpers (preserved from prior implementation; battle-tested against messy agent output) ----

type LensEntry = { score?: number; rating?: string; rationale: string };
type Scorecard = {
  voice: LensEntry;
  messaging: LensEntry;
  strategy: LensEntry;
};

interface ReviewResult {
  improvedCopy: string;
  changes: { text: string; lens: string }[];
  scorecard: Scorecard;
  improvedScorecard: Scorecard | null;
  raw: string;
}

function stripInlineLensAnnotations(text: string): {
  cleanText: string;
  extractedChanges: { text: string; lens: string }[];
} {
  const extractedChanges: { text: string; lens: string }[] = [];
  const annotationPattern =
    /\s*\[(?:(Voice|Messaging|Strategy)):\s*(.*?)\]\s*/gi;
  let cleanText = text.replace(annotationPattern, (_match, lens, note) => {
    if (note.trim())
      extractedChanges.push({ text: note.trim(), lens: lens.toLowerCase() });
    return " ";
  });
  cleanText = cleanText.replace(
    /\s*(?:\[(?:Voice|Messaging|Strategy)\]|\((?:Voice|Messaging|Strategy)\)|\*\*(?:Voice|Messaging|Strategy)\*\*)\s*/gi,
    " ",
  );
  const metaVerbs =
    "(?:Opens|Brings|Uses|Lists|Adds|Reinforces|Demonstrates|Creates|Anchors|Ensures|Shifts|Grounds|Connects|Aligns|Maintains|Establishes|Highlights|Emphasizes|Invites|Reflects|Signals|Introduces|Transitions|Mirrors|Echoes|Balances|Frames|Positions|Closes|Delivers|Builds|Suggests|Strengthens|Retains|Supports|Conveys|Integrates|Incorporates|References|Clarifies|Elevates|Simplifies|Humanizes|Personalizes|Tightens|Broadens|Narrows|Softens|Sharpens|Sets|Removes|Replaces|Reframes|Restates|Acknowledges|Addresses)";
  // Brand-agnostic indicators only. Vusion-specific "Connected Commerce" was
  // here originally; removed to keep the helper portable across clients. The
  // structured `changes` array from the agent's response_format is the primary
  // path; this text-parsing fallback only fires when the agent returns markdown.
  const metaIndicators =
    "(?:voice|messaging|strategy|lens|framework|principle|thematic|tone|POV|audience|rhetorical|declarative|first-person|imperative|hierarchy|brand|positioning|narrative|copy|tagline|headline|subhead|CTA|persuasion|paragraph|sentence|section|structure|platform)";
  const metaPattern = new RegExp(
    `(?<=[\\.!?]\\s+|^)${metaVerbs}\\s[^.!?]*(?:${metaIndicators})[^.!?]*[.!?]`,
    "gim",
  );
  const metaMatches = cleanText.match(metaPattern);
  if (metaMatches) {
    for (const m of metaMatches) {
      let lens = "voice";
      if (/messaging|message|benefit|hierarchy/i.test(m)) lens = "messaging";
      else if (
        /strategy|principle|positioning|platform|framework|structure/i.test(m)
      )
        lens = "strategy";
      extractedChanges.push({ text: m.trim(), lens });
      cleanText = cleanText.replace(m, "");
    }
  }
  cleanText = cleanText
    .replace(/ {2,}/g, " ")
    .replace(/ ([.,;:!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { cleanText, extractedChanges };
}

function deepExtractText(value: any, depth = 0): string {
  if (depth > 5) return typeof value === "string" ? value : "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return deepExtractText(JSON.parse(trimmed), depth + 1);
      } catch {}
    }
    return value
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (value.data?.improved_copy || value.data?.scorecard) return "";
    for (const key of [
      "response",
      "text",
      "message",
      "content",
      "result",
      "output",
    ]) {
      if (key in value && value[key] != null) {
        const extracted = deepExtractText(value[key], depth + 1);
        if (extracted) return extracted;
      }
    }
  }
  return "";
}

function extractFromMarkdown(text: string): ReviewResult {
  const result: ReviewResult = {
    improvedCopy: "",
    changes: [],
    scorecard: {
      voice: { rating: "Unknown", rationale: "" },
      messaging: { rating: "Unknown", rationale: "" },
      strategy: { rating: "Unknown", rationale: "" },
    },
    improvedScorecard: null,
    raw: text,
  };
  if (!text.trim()) return result;

  // 1) Improved copy section — header like "## Improved Copy", "## Improved Email Copy", "## Refined Copy", "## Revised Copy"
  const improvedRe =
    /(?:^|\n)#{1,4}\s*(?:Improved|Refined|Revised|Updated)\s+(?:[A-Za-z]+\s+)?Copy\b[^\n]*\n([\s\S]*?)(?=\n#{1,4}\s+\S|\n---+\s*\n|$)/i;
  const im = text.match(improvedRe);
  let improved = im ? im[1] : "";

  if (!improved) {
    // No header — slice off any trailing commentary blocks and use the rest
    improved = text
      .replace(
        /\n#{1,4}\s+(?:Changes?(?:\s+Made)?|Annotations?|Three[- ]Lens[\s\S]*?|Scorecard|Commentary|Notes(?:\s+on\s+choices)?|Why\s+These\s+Changes)\b[\s\S]*$/i,
        "",
      )
      .replace(/\n---+\s*$/m, "");
  }

  // Final tidy on the improved copy text
  improved = improved
    .replace(/^```[\w]*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .replace(/^---+\s*\n?/, "")
    .replace(/\n---+\s*$/m, "")
    .replace(/\*\*(.*?)\*\*/g, "$1") // unwrap bold
    .replace(/^#{1,6}\s+.*$/gm, "") // drop any stray markdown headers
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  result.improvedCopy = improved;

  // 2) Changes section — split into bullets if present, else split into sentences
  const changesRe =
    /(?:^|\n)#{1,4}\s*(?:Changes?(?:\s+Made)?|Annotations?|Notes(?:\s+on\s+choices)?|Why\s+These\s+Changes)\b[^\n]*\n([\s\S]*?)(?=\n#{1,4}\s+\S|\n---+\s*\n|$)/i;
  const cm = text.match(changesRe);
  if (cm) {
    const body = cm[1].trim();
    const bullets = body
      .split("\n")
      .filter((l) => /^\s*[-*•]/.test(l) || /^\s*\d+[.)]/.test(l))
      .map((l) =>
        l
          .replace(/^\s*[-*•]\s*/, "")
          .replace(/^\s*\d+[.)]\s*/, "")
          .replace(/\*\*/g, "")
          .trim(),
      )
      .filter(Boolean);
    const items = bullets.length
      ? bullets
      : body
          .split(/(?<=[.!?])\s+/)
          .map((s) => s.replace(/\*\*/g, "").trim())
          .filter((s) => s.length > 12);
    for (const note of items) {
      let lens = "voice";
      if (/messaging|hierarchy|theme|key\s+message|benefit/i.test(note))
        lens = "messaging";
      else if (
        /strategy|principle|positioning|promise|verbal\s+strategy|connected\s+commerce/i.test(
          note,
        )
      )
        lens = "strategy";
      result.changes.push({ text: note, lens });
    }
  }

  // 3) Scorecard — look for "**Voice:** Strong — rationale" or "Voice: Needs Adjustment - rationale"
  const lensFor = (name: "voice" | "messaging" | "strategy") => {
    const re = new RegExp(
      `(?:^|\\n)\\s*(?:[-*]\\s*)?\\*{0,2}\\s*${name}\\s*\\*{0,2}\\s*[:\\-—]\\s*\\*{0,2}\\s*(Strong|Needs\\s+Adjustment|On[- ]Brand|Off[- ]Brand|Aligned|Misaligned)\\b\\*{0,2}\\s*[:\\-—]?\\s*([^\\n]*)`,
      "i",
    );
    const m = text.match(re);
    if (m) {
      return {
        rating: m[1].trim(),
        rationale: (m[2] || "")
          .replace(/\*\*/g, "")
          .trim()
          .replace(/^[\s\-:.,]+/, ""),
      };
    }
    return { rating: "Unknown", rationale: "" };
  };
  result.scorecard = {
    voice: lensFor("voice"),
    messaging: lensFor("messaging"),
    strategy: lensFor("strategy"),
  };

  return result;
}

// Normalize a scorecard lens entry from the agent. Captures both `score` (new numeric)
// and `rating` (legacy qualitative) so downstream lensScore can prefer numeric when present.
function pickLensEntry(raw: any): {
  score?: number;
  rating?: string;
  rationale: string;
} {
  if (!raw || typeof raw !== "object")
    return { rating: "Unknown", rationale: "" };
  return {
    score: typeof raw.score === "number" ? raw.score : undefined,
    rating: typeof raw.rating === "string" ? raw.rating : undefined,
    rationale: typeof raw.rationale === "string" ? raw.rationale : "",
  };
}

function parseReviewResponse(response: any): ReviewResult {
  let structuredData = response?.data;
  if (!structuredData?.improved_copy && !structuredData?.scorecard) {
    const inner =
      typeof response?.response === "string"
        ? (() => {
            try {
              return JSON.parse(response.response);
            } catch {
              return null;
            }
          })()
        : response?.response;
    if (inner?.data?.improved_copy || inner?.data?.scorecard)
      structuredData = inner.data;
  }
  if (structuredData?.improved_copy || structuredData?.scorecard) {
    return {
      improvedCopy: structuredData.improved_copy || "",
      changes: Array.isArray(structuredData.changes)
        ? structuredData.changes.map((c: any) => ({
            text: c.note || c.text || "",
            lens: (c.lens || "voice").toLowerCase(),
          }))
        : [],
      scorecard: {
        voice: pickLensEntry(structuredData.scorecard?.voice),
        messaging: pickLensEntry(structuredData.scorecard?.messaging),
        strategy: pickLensEntry(structuredData.scorecard?.strategy),
      },
      improvedScorecard: structuredData.improved_scorecard
        ? {
            voice: pickLensEntry(structuredData.improved_scorecard.voice),
            messaging: pickLensEntry(
              structuredData.improved_scorecard.messaging,
            ),
            strategy: pickLensEntry(structuredData.improved_scorecard.strategy),
          }
        : null,
      raw: deepExtractText(response) || "",
    };
  }
  return extractFromMarkdown(deepExtractText(response));
}

// ---- UI ----

interface ReviewSectionProps {
  channel: string;
  audience: string;
  onCallAgent: (prompt: string) => Promise<any>;
  // Quiet agent call for re-scoring an edited copy (no global loading toggle).
  onScore?: (prompt: string) => Promise<any>;
  loading: boolean;
  pendingCopy?: string | null;
  pendingScores?: { voice: number; messaging: number; strategy: number } | null;
  onPendingConsumed?: () => void;
  // Reopening a saved chat: hydrate the full result view (copy + scores + detail)
  // instead of the empty paste state, so the scores show with the reloaded copy.
  reopenedVersion?: {
    copy: string;
    scores: { voice: number; messaging: number; strategy: number } | null;
    changes?: { text: string; lens: string }[];
    overallNote?: string;
  } | null;
  onReopenConsumed?: () => void;
  onChannelChange: (channel: string) => void;
  onAudienceChange: (audience: string) => void;
  rescoringAbortControllerRef?: React.MutableRefObject<AbortController | null>;
  // Abort controller for the in-flight refine call, so the user can cancel it.
  refineAbortControllerRef?: React.MutableRefObject<AbortController | null>;
}

const LENGTH_OPTIONS = ["Shorter", "Same", "Longer"];

export default function ReviewSection({
  channel,
  audience,
  onCallAgent,
  onScore,
  loading,
  pendingCopy,
  pendingScores,
  onPendingConsumed,
  reopenedVersion,
  onReopenConsumed,
  onChannelChange,
  onAudienceChange,
  rescoringAbortControllerRef,
  refineAbortControllerRef,
}: ReviewSectionProps) {
  const { profile } = useBrandProfile();
  const { saveVersion, activeChat, activeChatId, activeVersionIndex } =
    useChatHistory();
  const brand = profile || emptyBrandProfile();
  const [pastedCopy, setPastedCopy] = useState("");
  const [toneIntensity, setToneIntensity] = useState([5]);
  const [lengthPref, setLengthPref] = useState("Same");
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allAccepted, setAllAccepted] = useState(false);
  const [viewMode, setViewMode] = useState<"diff" | "refined" | "original">(
    "diff",
  );
  // Which lens score card is expanded into the shared rationale panel below the
  // row. null = collapsed. Clicking the active card again collapses it.
  const [openLens, setOpenLens] = useState<
    "overall" | "voice" | "messaging" | "strategy" | null
  >(null);
  // Candidate/override state. After a refine pass, `result` is the candidate.
  // A manual edit diverges `candidateCopy` from the agent's text (an "override").
  // Nothing is persisted until the user clicks "Save to history".
  const [candidateCopy, setCandidateCopy] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [lastNotes, setLastNotes] = useState<string[]>([]);
  // The "Overall Brand Fit" rationale captured from a reopened version. null
  // means "not reopened" → compute it live from the result via pickWhyThisMatters.
  const [reopenOverallNote, setReopenOverallNote] = useState<string | null>(
    null,
  );
  // Confirm dialog shown when saving from a version that isn't the latest
  // (which would discard the newer "future" versions).
  const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rescoring, setRescoring] = useState(false);
  // True only when `result` is the direct output of an agent refine pass (so the
  // "Already on-brand" banner doesn't fire when merely viewing a saved version
  // whose original/refined copy are identical).
  const [cameFromRefine, setCameFromRefine] = useState(false);
  // Carryover from Compose: variant's lens scores shown as the "original" before the user clicks Refine.
  // Once Refine returns, the agent's authoritative scorecard supersedes this for display.
  const [presetOriginalScores, setPresetOriginalScores] = useState<{
    voice: number;
    messaging: number;
    strategy: number;
  } | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  // Track rescoring operations so we can cancel them on discard
  const rescoringIdRef = useRef(0);
  const rescoringSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (pendingCopy && pendingCopy.trim()) {
      setPastedCopy(pendingCopy);
      setResult(null);
      setError(null);
      setAllAccepted(false);
      setViewMode("diff");
      setPresetOriginalScores(pendingScores ?? null);
      setNotes([]);
      setNoteDraft("");
      setCandidateCopy(null);
      setIsEditing(false);
      setJustSaved(false);
      setLastNotes([]);
      setReopenOverallNote(null);
      setCameFromRefine(false);
      onPendingConsumed?.();
    }
  }, [pendingCopy, pendingScores, onPendingConsumed]);

  // Hydrate the result view from a saved version's copy + scores + detail (so
  // the reloaded/restored copy shows with its scores instead of the empty paste
  // state). With no scores it falls back to the empty state with the copy filled.
  const hydrateFromVersion = useCallback(
    (v: {
      copy: string;
      scores: { voice: number; messaging: number; strategy: number } | null;
      changes?: { text: string; lens: string }[];
      overallNote?: string;
    }) => {
      setPastedCopy(v.copy);
      setError(null);
      setAllAccepted(false);
      setCandidateCopy(null);
      setIsEditing(false);
      setJustSaved(false);
      setNotes([]);
      setNoteDraft("");
      setLastNotes([]);
      // Synthesized from a saved version — not a fresh refine pass.
      setCameFromRefine(false);
      if (v.scores) {
        const sc: Scorecard = {
          voice: { score: v.scores.voice, rationale: "" },
          messaging: { score: v.scores.messaging, rationale: "" },
          strategy: { score: v.scores.strategy, rationale: "" },
        };
        setPresetOriginalScores(v.scores);
        setReopenOverallNote(v.overallNote ?? "");
        setViewMode("refined");
        setResult({
          improvedCopy: v.copy,
          changes: v.changes ?? [],
          scorecard: sc,
          improvedScorecard: sc,
          raw: v.copy,
        });
      } else {
        setPresetOriginalScores(null);
        setReopenOverallNote(null);
        setViewMode("diff");
        setResult(null);
      }
    },
    [],
  );

  // Reopen a saved chat (sidebar click / version timeline): hydrate from the
  // handed-off version, then clear the one-shot prop.
  useEffect(() => {
    if (!reopenedVersion) return;
    hydrateFromVersion(reopenedVersion);
    onReopenConsumed?.();
  }, [reopenedVersion, onReopenConsumed, hydrateFromVersion]);

  // Mount restore: returning to Refine (e.g. from Learn) remounts this section,
  // but the chat is still active in the provider. With no pending handoff,
  // restore the currently-loaded version so the chat doesn't appear to vanish.
  // The active chat is only cleared by "New chat" / switching to Compose.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (pendingCopy || reopenedVersion) return; // a handoff effect will hydrate
    if (!activeChat || activeVersionIndex == null) return;
    const v = activeChat.versions?.[activeVersionIndex];
    if (!v) return;
    hydrateFromVersion({
      copy: v.copy,
      scores: v.scores ?? null,
      changes: v.changes ?? [],
      overallNote: v.overallNote ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset state if the active chat is deleted
  const prevActiveChatRef = useRef<ChatHistory | null>(null);
  useEffect(() => {
    const hadActiveChat = prevActiveChatRef.current !== null;
    const chatWasDeleted = hadActiveChat && !activeChat;
    if (chatWasDeleted && (result || reopenedVersion)) {
      setPastedCopy("");
      setResult(null);
      setError(null);
      setAllAccepted(false);
      setViewMode("diff");
      setPresetOriginalScores(null);
      setNotes([]);
      setNoteDraft("");
      setCandidateCopy(null);
      setIsEditing(false);
      setJustSaved(false);
      setLastNotes([]);
      setReopenOverallNote(null);
      setCameFromRefine(false);
    }
    prevActiveChatRef.current = activeChat;
  }, [activeChat, result, pastedCopy, reopenedVersion]);

  // Refine the given copy. Iteration is cumulative: "Refine Again" passes the
  // latest improved copy as `baseline`, which becomes the new "original" the
  // agent works from (and the new diff/scorecard anchor) so improvements stack
  // pass over pass. The first pass omits `baseline`, so it refines pastedCopy.
  // baseline/notes are passed explicitly (not read from state) because setState
  // is async and wouldn't be flushed by the time we build the prompt.
  const handleRefine = async (opts?: {
    baseline?: string;
    notesOverride?: string[];
  }) => {
    const sourceCopy = (opts?.baseline ?? pastedCopy).trim();
    if (!sourceCopy) return;
    setError(null);
    setAllAccepted(false);
    setViewMode("diff");
    // Clean here (not on every keystroke) so the textarea keeps trailing
    // spaces / blank lines while the user is typing.
    const activeNotes = (opts?.notesOverride ?? notes)
      .map((s) => s.trim())
      .filter(Boolean);
    const notesBlock = activeNotes.length
      ? `\n\nUser Notes (apply as additional guidance for this refinement):\n${activeNotes.map((n, i) => `${i + 1}. ${n}`).join("\n")}`
      : "";
    const prompt = `${buildBrandContextBlock(brand)}\nChannel: ${channel || "Non-Specific"}\nAudience: ${audience || "general"}\nTone Intensity: ${toneIntensity[0]}/10\nLength Preference: ${lengthPref}\n\nOriginal Copy:\n${sourceCopy}${notesBlock}\n\nReview and improve this copy. Return JSON with mode="review" and data containing: improved_copy (clean revised text only), changes (array of {lens, note} for each change), scorecard (for ORIGINAL), improved_scorecard (for the new refinement). Apply the scoring rules from your instructions: full 0-100 range, 85+ is a high bar, and the always-update + strict-greater rules when any original lens is below 85.`;
    const response = await onCallAgent(prompt);
    if (response) {
      // Promote the refined-from copy to be the displayed original + diff anchor.
      // No-op on the first pass (sourceCopy === pastedCopy).
      setPastedCopy(sourceCopy);
      setResult(parseReviewResponse(response));
      setNotes([]);
      setNoteDraft("");
      // A genuine refine pass — enables the "Already on-brand" banner when the
      // agent returns no changes.
      setCameFromRefine(true);
      // Fresh agent candidate — clear any manual override + saved confirmation.
      setCandidateCopy(null);
      setIsEditing(false);
      setJustSaved(false);
      setLastNotes(activeNotes);
      // Fresh result → compute the overall note live again, not from the reopened version.
      setReopenOverallNote(null);
    } else {
      setError("Failed to refine copy. Please try again.");
    }
  };

  // Raw refined copy (markdown preserved, only lens annotations removed). Edit
  // mode shows this verbatim; preview mode renders it as markdown.
  const cleanedImproved = useMemo(() => {
    if (!result) return "";
    return stripInlineLensAnnotations(result.improvedCopy).cleanText;
  }, [result]);

  // The copy that would be saved/refined-from: a manual override if the user
  // edited it, otherwise the agent's refined copy (both raw markdown).
  const currentCandidate = candidateCopy ?? cleanedImproved;

  // Markdown-stripped variants — used only by the word-diff / block-diff
  // comparison views (not the copy target) so symbols don't pollute the diff.
  const strippedOriginal = useMemo(
    () => stripMarkdown(pastedCopy),
    [pastedCopy],
  );
  const strippedCandidate = useMemo(
    () => stripMarkdown(currentCandidate),
    [currentCandidate],
  );

  const segments: DiffSegment[] = useMemo(() => {
    if (!result || !cleanedImproved) return [];
    return diffWords(strippedOriginal, strippedCandidate);
  }, [strippedOriginal, strippedCandidate, cleanedImproved, result]);

  // Original scores: prefer the agent's authoritative scorecard from a completed Refine.
  // If no Refine has run yet but we have carryover scores from Compose, use those.
  const originalScores = useMemo(() => {
    if (result) {
      return {
        voice: lensScore(result.scorecard.voice, "voice"),
        messaging: lensScore(result.scorecard.messaging, "messaging"),
        strategy: lensScore(result.scorecard.strategy, "strategy"),
      };
    }
    if (presetOriginalScores) {
      return {
        voice: lensScore({ score: presetOriginalScores.voice }, "voice"),
        messaging: lensScore(
          { score: presetOriginalScores.messaging },
          "messaging",
        ),
        strategy: lensScore(
          { score: presetOriginalScores.strategy },
          "strategy",
        ),
      };
    }
    return null;
  }, [result, presetOriginalScores]);

  // Improved scores: only available after the agent returns improved_scorecard.
  const improvedScores = useMemo(() => {
    if (!result?.improvedScorecard) return null;
    return {
      voice: lensScore(result.improvedScorecard.voice, "voice"),
      messaging: lensScore(result.improvedScorecard.messaging, "messaging"),
      strategy: lensScore(result.improvedScorecard.strategy, "strategy"),
    };
  }, [result]);

  // The "Overall Brand Fit" rationale: the reopened note when present (incl. an
  // empty string for compose-only chats), else computed live from the result.
  const overallBody = result
    ? (reopenOverallNote ?? pickWhyThisMatters(result, channel, audience))
    : null;

  // Are we working from an earlier version? Saving would discard the newer ones.
  const versionsCount = activeChat?.versions?.length ?? 0;
  const onOldVersion =
    activeVersionIndex != null && activeVersionIndex < versionsCount - 1;
  const futureCount = onOldVersion
    ? versionsCount - 1 - (activeVersionIndex as number)
    : 0;

  // Save click: warn first when on an older version, else save immediately.
  const handleSaveClick = () => {
    if (onOldVersion) setConfirmOverwriteOpen(true);
    else void handleSaveVersion();
  };

  // The saved version currently selected in the edit history (if any).
  const loadedVersion =
    activeVersionIndex != null
      ? activeChat?.versions?.[activeVersionIndex]
      : undefined;
  // "Dirty" = the shown copy differs from that selected version (canonicalized
  // the same way as the displayed copy, so loading a version isn't seen as a
  // change). With no saved version yet, any non-empty copy counts as a change.
  const isDirty = useMemo(() => {
    const current = currentCandidate.trim();
    if (!loadedVersion) return current.length > 0;
    return (
      current !==
      stripInlineLensAnnotations(loadedVersion.copy).cleanText.trim()
    );
  }, [currentCandidate, loadedVersion]);

  // Discard unsaved changes: re-hydrate the currently-loaded saved version,
  // dropping the latest refine result / manual edit. Only meaningful when a
  // saved version exists to revert to.
  const canDiscard =
    !!activeChat?.versions?.length && activeVersionIndex != null;
  const handleDiscard = () => {
    // Cancel any pending rescoring
    rescoringIdRef.current++;
    rescoringAbortControllerRef?.current?.abort();
    if (rescoringSessionRef.current) {
      fetch("/api/maia/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: rescoringSessionRef.current }),
      }).catch(() => {
        // Silently fail if stop request fails
      });
    }
    if (!activeChat || activeVersionIndex == null) return;
    const v = activeChat.versions?.[activeVersionIndex];
    if (!v) return;
    hydrateFromVersion({
      copy: v.copy,
      scores: v.scores ?? null,
      changes: v.changes ?? [],
      overallNote: v.overallNote ?? "",
    });
  };

  // Re-score an edited copy. Sends it to the refine agent and reads back the
  // `scorecard` (the agent scores its INPUT there), then updates the displayed
  // improved scores — without touching the user's edited text.
  const handleRescore = async (copyToScore: string) => {
    const text = copyToScore.trim();
    if (!text || !onScore) return;
    const rescoringId = ++rescoringIdRef.current;
    setRescoring(true);
    const prompt = `${buildBrandContextBlock(brand)}\nChannel: ${channel || "Non-Specific"}\nAudience: ${audience || "general"}\nTone Intensity: ${toneIntensity[0]}/10\nLength Preference: ${lengthPref}\n\nCopy to evaluate:\n${text}\n\nScore the copy above for brand fit AS-IS — do not rewrite it. Return JSON with mode="review" and data.scorecard = {voice, messaging, strategy}, each an object with an integer "score" (0-100) and a short "rationale". Apply the scoring rules from your instructions: full 0-100 range, 85+ is a high bar.`;
    const response = await onScore(prompt);
    // Capture the session ID for this rescore
    if (response?.session_id) {
      rescoringSessionRef.current = response.session_id;
    }
    // Only update if this rescoring is still the latest (discard didn't happen)
    if (response && rescoringId === rescoringIdRef.current) {
      const parsed = parseReviewResponse(response);
      const hasNumbers = (c: Scorecard | null): c is Scorecard =>
        !!c &&
        (typeof c.voice?.score === "number" ||
          typeof c.messaging?.score === "number" ||
          typeof c.strategy?.score === "number");
      // The agent scores its input in `scorecard`; fall back to improved_scorecard.
      const sc = hasNumbers(parsed.scorecard)
        ? parsed.scorecard
        : hasNumbers(parsed.improvedScorecard)
          ? parsed.improvedScorecard
          : null;
      if (sc) {
        // Reflect the edited copy's fresh score as the current ("improved")
        // score, and refresh the lens detail + overall rationale to match.
        setResult((prev) =>
          prev
            ? {
                ...prev,
                improvedScorecard: sc,
                changes: parsed.changes?.length ? parsed.changes : prev.changes,
              }
            : prev,
        );
        setReopenOverallNote(null);
      }
    }
    setRescoring(false);
  };

  // Copy the current copy WITH formatting (rich text) so bold/italic/links and
  // structure survive a paste into email/docs; falls back to clean plain text.
  const handleCopy = async () => {
    const text = currentCandidate.trim();
    if (!text) return;
    const ok = await copyRichText(markdownToHtml(text), stripMarkdown(text));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  // Save the current candidate as a new version in the active chat. Marks the
  // version 'override' when the user manually edited it, else 'refine'.
  const handleSaveVersion = async () => {
    const copy = currentCandidate.trim();
    if (!copy || saving) return;
    setSaving(true);
    const flatScores = improvedScores
      ? {
          voice: improvedScores.voice.score,
          messaging: improvedScores.messaging.score,
          strategy: improvedScores.strategy.score,
        }
      : originalScores
        ? {
            voice: originalScores.voice.score,
            messaging: originalScores.messaging.score,
            strategy: originalScores.strategy.score,
          }
        : null;
    // Paste-started chat (no chat yet): capture the user's original pasted
    // draft as version 0, scored with the pre-refine ("original") scores, so
    // the timeline reads "your draft → refined". Skip when it matches the copy
    // being saved (e.g. the agent made no changes).
    const draft = pastedCopy.trim();
    const seed: ChatVersion | undefined =
      !activeChatId && draft && draft !== copy
        ? {
            copy: pastedCopy,
            scores: originalScores
              ? {
                  voice: originalScores.voice.score,
                  messaging: originalScores.messaging.score,
                  strategy: originalScores.strategy.score,
                }
              : null,
            source: "draft",
            note: "",
            changes: [],
            overallNote: "",
          }
        : undefined;
    const ok = await saveVersion(
      {
        copy,
        scores: flatScores,
        source: candidateCopy != null ? "override" : "refine",
        note: lastNotes.join(" | "),
        // Persist the per-lens rationale + overall note so the score detail and
        // "Overall Brand Fit" rationale re-render verbatim on reopen.
        changes: result?.changes ?? [],
        overallNote: overallBody ?? "",
      },
      seed,
    );
    setSaving(false);
    if (ok) {
      setJustSaved(true);
      setIsEditing(false);
      // Saving commits the candidate — also lock the view to the accepted
      // (refined) copy. "Refine Again" resets allAccepted to reopen iteration.
      setAllAccepted(true);
      // Update the baseline to the newly saved version so future comparisons
      // are against this saved version, not the original pasted copy
      setPastedCopy(currentCandidate.trim());
      setCandidateCopy(null);
    } else {
      setError("Failed to save to history. Please try again.");
    }
  };

  const originalOverall = useMemo(() => {
    if (result) {
      if (allAccepted) return null; // allAccepted shows the improved side only
      return overallScore(result.scorecard);
    }
    if (presetOriginalScores) {
      return overallScore({
        voice: { score: presetOriginalScores.voice },
        messaging: { score: presetOriginalScores.messaging },
        strategy: { score: presetOriginalScores.strategy },
      });
    }
    return null;
  }, [result, presetOriginalScores, allAccepted]);

  const improvedOverall = useMemo(() => {
    if (allAccepted) return { score: 92, status: "on-brand" as const };
    if (!result?.improvedScorecard) return null;
    return overallScore(result.improvedScorecard);
  }, [result, allAccepted]);

  // ---- Current vs. previous lens scores ----
  // "Previous" is shown whenever a prior score exists — not just after a
  // refine/rescore: while you have unsaved changes it's the version you're
  // working from; while viewing a saved version it's the one before it in the
  // history. The displayed copy's score is "current".
  type Flat = { voice: number; messaging: number; strategy: number };
  const toFlat = (
    s: {
      voice: { score: number };
      messaging: { score: number };
      strategy: { score: number };
    } | null,
  ): Flat | null =>
    s
      ? {
          voice: s.voice.score,
          messaging: s.messaging.score,
          strategy: s.strategy.score,
        }
      : null;
  const overallFromFlat = (s: Flat | null): number | undefined =>
    s
      ? overallScore({
          voice: { score: s.voice },
          messaging: { score: s.messaging },
          strategy: { score: s.strategy },
        }).score
      : undefined;

  const loadedVersionScores: Flat | null =
    activeVersionIndex != null
      ? (activeChat?.versions?.[activeVersionIndex]?.scores ?? null)
      : null;
  const priorVersionScores: Flat | null =
    activeVersionIndex != null && activeVersionIndex > 0
      ? (activeChat?.versions?.[activeVersionIndex - 1]?.scores ?? null)
      : null;

  const currentScores = toFlat(improvedScores) ?? toFlat(originalScores);
  const previousScores: Flat | null = isDirty
    ? (loadedVersionScores ?? toFlat(originalScores))
    : priorVersionScores;

  const currentOverall = improvedOverall?.score ?? originalOverall?.score;
  const previousOverall = isDirty
    ? loadedVersionScores
      ? overallFromFlat(loadedVersionScores)
      : originalOverall?.score
    : overallFromFlat(priorVersionScores);

  // Group the agent's per-change rationales by lens, so the new right-margin
  // renders ONE card per lens (with a bulleted summary when there are
  // multiple changes) instead of one row per change.
  const changesByLens = useMemo(() => {
    const groups: Record<"voice" | "messaging" | "strategy", string[]> = {
      voice: [],
      messaging: [],
      strategy: [],
    };
    for (const c of result?.changes ?? []) {
      const lens = (c.lens || "voice").toLowerCase();
      if (lens === "voice" || lens === "messaging" || lens === "strategy") {
        if (c.text?.trim()) groups[lens].push(c.text.trim());
      }
    }
    return groups;
  }, [result]);

  // Empty state — paste & configure. 2-col layout: Brief (left) | Submit Your
  // Copy (right). "Keep Copy on Brand" explanation lives under the brief card
  // on the left so the right column stays focused on copy entry + Refine.
  if (!result) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6 lg:gap-8">
        {/* ---- LEFT: Step 01 — Build the Brief ---- */}
        <div className="flex flex-col">
          <StepEyebrow step={1} label="Build the Brief" />

          <section className="rounded-2xl border border-black/75 p-4 lg:p-5 flex flex-col">
            <div className="space-y-3">
              {/* Channel */}
              <div>
                <h4 className="font-bold text-sm text-studio-ink mb-2">
                  Select a channel:
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {CHANNELS.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => onChannelChange(ch)}
                      className={`px-3 py-1 rounded-full text-xs transition ${
                        channel === ch
                          ? "bg-studio-ink text-studio-page"
                          : "bg-studio-page border border-studio-border text-studio-muted hover:text-studio-ink"
                      }`}
                    >
                      {ch.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Audience */}
              <div>
                <h4 className="font-bold text-sm text-studio-ink">
                  Define the audience:
                </h4>
                <p className="text-xs italic text-studio-mutedSoft mb-1">
                  Who do you want to talk to?
                </p>
                <Input
                  value={audience}
                  onChange={(e) => onAudienceChange(e.target.value)}
                  placeholder="Internal leaders"
                  className="bg-studio-page border-studio-border text-sm text-studio-ink placeholder:text-studio-mutedSoft"
                />
              </div>

              {/* Length */}
              <div>
                <h4 className="font-bold text-sm text-studio-ink mb-2">
                  Select length:
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {LENGTH_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setLengthPref(opt)}
                      className={`px-3 py-1 rounded-full text-xs transition ${
                        lengthPref === opt
                          ? "bg-studio-ink text-studio-page"
                          : "bg-studio-page border border-studio-border text-studio-muted hover:text-studio-ink"
                      }`}
                    >
                      {opt.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tone */}
              <div>
                <h4 className="font-bold text-sm text-studio-ink">Tone:</h4>
                <p className="text-xs italic text-studio-mutedSoft mb-1">
                  How do we want to sound?
                </p>
                <Slider
                  value={toneIntensity}
                  onValueChange={setToneIntensity}
                  min={1}
                  max={10}
                  step={1}
                />
                <div className="flex justify-between text-xs text-studio-mutedSoft mt-1">
                  <span>subtle</span>
                  <span>bold</span>
                </div>
                <p className="text-sm font-bold text-studio-ink mt-1">
                  {toneIntensity[0]}/10
                </p>
              </div>
            </div>
          </section>

          {/* Keep Copy on Brand — below the brief card */}
          <aside className="px-1 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="h-5 w-5 text-studio-ink" />
              <h3 className="font-bold text-base text-studio-ink">
                Keep Copy on Brand
              </h3>
            </div>
            <p className="text-sm text-studio-muted leading-relaxed mb-3">
              Your copy will be assessed based on brand{" "}
              <span className="font-bold text-studio-ink">
                fit across Voice, Messaging, and Strategy
              </span>
              .
            </p>
            <p className="text-sm text-studio-muted leading-relaxed">
              You&rsquo;ll also get a{" "}
              <span className="font-bold text-studio-ink">
                rationale for every recommended revision
              </span>{" "}
              so you can understand why we made it.
            </p>
          </aside>
        </div>

        {/* ---- RIGHT: Step 02 — Submit Your Copy ---- */}
        <div className="flex flex-col">
          <StepEyebrow step={2} label="Submit Your Copy" />

          <div className="space-y-3">
            <Textarea
              placeholder="Copy"
              value={pastedCopy}
              onChange={(e) => setPastedCopy(e.target.value)}
              rows={10}
              className="bg-studio-page border-studio-border text-studio-ink placeholder:text-studio-mutedSoft resize-none rounded-md text-sm leading-relaxed"
            />
            <Textarea
              placeholder="Notes (optional)"
              value={notes.join("\n")}
              // Store raw lines as-typed; trailing spaces/blank lines are
              // trimmed only at the point of use (handleRefine). Trimming here
              // would fight the controlled value and eat spaces mid-keystroke.
              onChange={(e) => setNotes(e.target.value.split("\n"))}
              rows={6}
              className="bg-studio-page border-studio-border text-studio-ink placeholder:text-studio-mutedSoft resize-none rounded-md text-sm leading-relaxed"
            />
          </div>

          {loading ? (
            <button
              type="button"
              onClick={() => refineAbortControllerRef?.current?.abort()}
              className="self-end mt-4 h-10 px-5 inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium bg-studio-card border border-studio-border text-studio-ink hover:bg-studio-border transition-colors"
            >
              <span>Cancel</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleRefine()}
              disabled={!pastedCopy.trim()}
              className="self-end mt-4 h-10 px-5 inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium bg-studio-ink text-studio-page hover:bg-studio-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span>Refine Copy</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}

          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-md bg-studio-card border border-studio-border text-xs mt-3">
              <AlertCircle className="h-3.5 w-3.5 text-studio-scoreRed flex-shrink-0" />
              <p className="text-studio-ink flex-1">{error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Result state
  const ratio = diffChangeRatio(segments);
  const useBlockDiff = ratio > 0.6;

  // Check if refined copy differs from original and if user has made actual edits
  const refinedIsDifferent = cleanedImproved.trim() !== pastedCopy.trim();
  const userHasActuallyEdited =
    candidateCopy !== null && candidateCopy.trim() !== cleanedImproved.trim();
  const shouldDisableRefinedButtons =
    !refinedIsDifferent && !userHasActuallyEdited;

  // Effective view mode (used by both the top tab row and the document column)
  const effectiveMode: "diff" | "refined" | "original" = isEditing
    ? viewMode // Allow user to edit regardless of button disabled state
    : shouldDisableRefinedButtons
      ? "original"
      : allAccepted
        ? "refined"
        : viewMode;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6 lg:gap-8">
      {/* ---- LEFT COLUMN: Brief + Scores + Notes + Refine (always visible) ---- */}
      <div className="flex flex-col space-y-5">
        <div>
          <StepEyebrow step={1} label="Build the Brief" />
          <section className="rounded-2xl border border-black/75 p-4 lg:p-5 flex flex-col">
            <div className="space-y-3">
              {/* Channel */}
              <div>
                <h4 className="font-bold text-sm text-studio-ink mb-2">
                  Select a channel:
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {CHANNELS.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => onChannelChange(ch)}
                      className={`px-3 py-1 rounded-full text-xs transition ${
                        channel === ch
                          ? "bg-studio-ink text-studio-page"
                          : "bg-studio-page border border-studio-border text-studio-muted hover:text-studio-ink"
                      }`}
                    >
                      {ch.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Audience */}
              <div>
                <h4 className="font-bold text-sm text-studio-ink">
                  Define the audience:
                </h4>
                <p className="text-xs italic text-studio-mutedSoft mb-1">
                  Who do you want to talk to?
                </p>
                <Input
                  value={audience}
                  onChange={(e) => onAudienceChange(e.target.value)}
                  placeholder="Internal leaders"
                  className="bg-studio-page border-studio-border text-sm text-studio-ink placeholder:text-studio-mutedSoft"
                />
              </div>

              {/* Length */}
              <div>
                <h4 className="font-bold text-sm text-studio-ink mb-2">
                  Select length:
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {LENGTH_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setLengthPref(opt)}
                      className={`px-3 py-1 rounded-full text-xs transition ${
                        lengthPref === opt
                          ? "bg-studio-ink text-studio-page"
                          : "bg-studio-page border border-studio-border text-studio-muted hover:text-studio-ink"
                      }`}
                    >
                      {opt.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tone */}
              <div>
                <h4 className="font-bold text-sm text-studio-ink">Tone:</h4>
                <p className="text-xs italic text-studio-mutedSoft mb-1">
                  How do we want to sound?
                </p>
                <Slider
                  value={toneIntensity}
                  onValueChange={setToneIntensity}
                  min={1}
                  max={10}
                  step={1}
                />
                <div className="flex justify-between text-xs text-studio-mutedSoft mt-1">
                  <span>subtle</span>
                  <span>bold</span>
                </div>
                <p className="text-sm font-bold text-studio-ink mt-1">
                  {toneIntensity[0]}/10
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Notes + Refine Again — shown when result exists */}
        {result && (
          <div className="pt-2">
            <p className="font-bold text-sm text-studio-ink mb-2">
              Any notes for the next pass?
            </p>
            <Textarea
              placeholder="Notes (optional)"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={3}
              className="bg-white border-studio-muted/30 text-studio-ink placeholder:text-studio-muted/65 text-sm rounded-md resize-none mb-3"
            />
            <div className="flex justify-end">
              {loading ? (
                <button
                  type="button"
                  onClick={() => refineAbortControllerRef?.current?.abort()}
                  className="h-10 px-5 inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium bg-studio-card border border-studio-border text-studio-ink hover:bg-studio-border transition-colors"
                >
                  <span>Cancel</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = noteDraft.trim();
                    // Cumulative: refine the current candidate (incl. manual edits), not the original.
                    handleRefine({
                      baseline: currentCandidate,
                      notesOverride: trimmed ? [trimmed] : [],
                    });
                  }}
                  className="h-10 px-5 inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium bg-studio-ink text-studio-page hover:bg-studio-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <span>Refine Copy</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ---- RIGHT COLUMN: Copy Input or Document ---- */}
      <div className="flex flex-col">
        {/* Step 2 label */}
        {result && <StepEyebrow step={2} label="Refine Copy" />}

        {/* Document column wrapper — flex-col so the bordered document
            stretches and Accept All sits at the bottom (top-aligning with the
            Refine Again button at the bottom of the scores rail). */}
        <div className="lg:order-2 flex flex-col">
          <div className="min-h-[400px] flex-1 flex flex-col rounded-2xl border border-studio-border p-6 lg:p-8">
            {/* Scores — above the Refine Copy tabs. Each card is a button that
                expands its rationale into the shared panel below the row. */}
            {result &&
              (() => {
                const lensCards = [
                  {
                    key: "overall" as const,
                    label: "Overall Brand Fit",
                    current: currentOverall,
                    previous: previousOverall,
                    body: overallBody,
                  },
                  {
                    key: "voice" as const,
                    label: "Voice",
                    current: currentScores?.voice,
                    previous: previousScores?.voice,
                    body: changesByLens.voice.length
                      ? joinChanges(changesByLens.voice)
                      : null,
                  },
                  {
                    key: "messaging" as const,
                    label: "Messaging",
                    current: currentScores?.messaging,
                    previous: previousScores?.messaging,
                    body: changesByLens.messaging.length
                      ? joinChanges(changesByLens.messaging)
                      : null,
                  },
                  {
                    key: "strategy" as const,
                    label: "Strategy",
                    current: currentScores?.strategy,
                    previous: previousScores?.strategy,
                    body: changesByLens.strategy.length
                      ? joinChanges(changesByLens.strategy)
                      : null,
                  },
                ];
                const open = lensCards.find((l) => l.key === openLens);
                return (
                  <div className="pb-4 mb-4 border-b border-studio-border">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {lensCards.map((lens) => (
                        <LensCard
                          key={lens.key}
                          label={lens.label}
                          current={lens.current}
                          previous={lens.previous}
                          loading={rescoring}
                          hasRationale={!!lens.body}
                          active={openLens === lens.key}
                          onClick={
                            lens.body
                              ? () =>
                                  setOpenLens((prev) =>
                                    prev === lens.key ? null : lens.key,
                                  )
                              : undefined
                          }
                        />
                      ))}
                    </div>
                    {open?.body && (
                      <div className="mt-3 rounded-lg bg-studio-cardSubtle p-3">
                        <p className="font-bold text-xs text-studio-ink mb-1">
                          {open.label}
                        </p>
                        <p className="text-sm text-studio-ink/85 leading-relaxed">
                          {open.body}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}
            {/* Right column header — "Refine Copy:" label + tabs (Annotated /
              Refined / Original). Accept All moved out, below the box. */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <h3 className="font-bold text-sm text-studio-ink">
                Refine Copy:
              </h3>
              <div className="flex items-center gap-1 text-sm">
                {!loading &&
                  (["diff", "refined", "original"] as const).map((mode) => {
                    const label =
                      mode === "diff"
                        ? "Annotated"
                        : mode === "refined"
                          ? "Refined"
                          : "Original";
                    const isActive = effectiveMode === mode;
                    // Enable all buttons while editing so user can navigate between tabs
                    const disabled = isEditing
                      ? false
                      : (shouldDisableRefinedButtons && mode !== "original") ||
                        (allAccepted && mode !== "refined");
                    return (
                      <button
                        key={mode}
                        onClick={() => !disabled && setViewMode(mode)}
                        disabled={disabled}
                        className={`px-3 py-1.5 rounded-md transition-colors text-sm ${
                          isActive
                            ? "bg-studio-card text-studio-ink font-medium"
                            : "text-studio-mutedSoft hover:text-studio-ink hover:bg-studio-cardSubtle"
                        } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                      >
                        {label}
                      </button>
                    );
                  })}
              </div>
              {/* Copy (with formatting) + manual edit, pinned to the right. */}
              {!loading && (
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleCopy}
                    title="Copy with formatting"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors text-studio-mutedSoft hover:text-studio-ink hover:bg-studio-cardSubtle"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <CopyIcon className="h-3.5 w-3.5" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isEditing) {
                        setIsEditing(false);
                        const hasRealChanges =
                          currentCandidate.trim() !== cleanedImproved.trim();
                        if (hasRealChanges) {
                          // Rescore the edited copy
                          void handleRescore(currentCandidate);
                        } else {
                          // Copy is back to original — cancel pending rescore and hide spinner immediately
                          rescoringIdRef.current++;
                          rescoringAbortControllerRef?.current?.abort();
                          if (rescoringSessionRef.current) {
                            fetch("/api/maia/stop", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                session_id: rescoringSessionRef.current,
                              }),
                            }).catch(() => {
                              // Silently fail if stop request fails
                            });
                          }
                          setRescoring(false);
                        }
                      } else {
                        // Cancel any pending rescores from the previous edit
                        rescoringIdRef.current++;
                        // Edit works even after a save/accept: editing the
                        // already-accepted copy starts a fresh override candidate
                        // the user can save as a new version.
                        if (candidateCopy == null)
                          setCandidateCopy(currentCandidate);
                        setAllAccepted(false);
                        setViewMode("refined");
                        setIsEditing(true);
                        setJustSaved(false);
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                      isEditing
                        ? "bg-studio-card text-studio-ink font-medium"
                        : "text-studio-mutedSoft hover:text-studio-ink hover:bg-studio-cardSubtle"
                    }`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {isEditing ? "Done editing" : "Edit"}
                  </button>
                </div>
              )}
            </div>

            {(() => {
              const changeCount = segments.filter(
                (s) => s.type !== "unchanged",
              ).length;
              const hasChanges = changeCount > 0;
              // Only celebrate when an actual refine pass returned no changes —
              // not when viewing a loaded version (no diff) or after a manual edit.
              const showCelebration =
                !hasChanges &&
                !allAccepted &&
                effectiveMode === "diff" &&
                cameFromRefine &&
                candidateCopy == null;

              return (
                <>
                  {showCelebration && (
                    <div className="mb-5 flex items-start gap-3 rounded-xl border border-studio-scoreGreen/30 bg-studio-scoreGreen/10 px-4 py-3">
                      <BadgeCheck className="h-5 w-5 text-studio-scoreGreen flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-base text-studio-ink leading-tight">
                          Already on-brand
                        </p>
                        <p className="text-[12px] text-studio-muted/80 mt-0.5">
                          No edits recommended. The margin notes explain why
                          this copy holds up across all three lenses.
                        </p>
                      </div>
                    </div>
                  )}

                  {loading && (
                    <div className="space-y-3">
                      <p className="text-lg leading-snug mb-1">
                        <LoadingWords
                          words={REFINE_LOADING_WORDS}
                          className="italic text-studio-muted/90"
                        />
                      </p>
                      <Skeleton className="h-5 w-full bg-studio-border/40" />
                      <Skeleton className="h-5 w-5/6 bg-studio-border/40" />
                      <Skeleton className="h-5 w-4/6 bg-studio-border/40" />
                    </div>
                  )}

                  {!loading && (
                    <>
                      {effectiveMode === "refined" &&
                        (isEditing ? (
                          <Textarea
                            value={currentCandidate}
                            onChange={(e) => {
                              setCandidateCopy(e.target.value);
                              setJustSaved(false);
                            }}
                            rows={12}
                            className="bg-studio-page border-studio-border text-studio-ink text-base md:text-base leading-relaxed resize-none rounded-md w-full flex-1 min-h-0"
                          />
                        ) : (
                          <MarkdownText
                            text={currentCandidate || pastedCopy}
                            className="text-studio-ink text-base leading-relaxed"
                          />
                        ))}

                      {effectiveMode === "original" && (
                        <MarkdownText
                          text={pastedCopy}
                          className="text-studio-ink text-base leading-relaxed"
                        />
                      )}

                      {effectiveMode === "diff" &&
                        (hasChanges ? (
                          useBlockDiff ? (
                            <div className="space-y-4">
                              <div className="rounded-lg bg-studio-scoreRed/5 border border-studio-scoreRed/20 p-4">
                                <p className="text-[10px] uppercase tracking-wider text-studio-scoreRed/80 mb-2">
                                  Original
                                </p>
                                <p className="text-studio-ink/80 text-base leading-relaxed whitespace-pre-wrap line-through decoration-studio-scoreRed/40">
                                  {strippedOriginal}
                                </p>
                              </div>
                              <div className="rounded-lg bg-studio-scoreGreen/5 border border-studio-scoreGreen/20 p-4">
                                <p className="text-[10px] uppercase tracking-wider text-studio-scoreGreen/80 mb-2">
                                  Refined
                                </p>
                                <p className="text-studio-ink text-base leading-relaxed whitespace-pre-wrap">
                                  {strippedCandidate}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-studio-ink text-base leading-relaxed whitespace-pre-wrap">
                              {segments.map((seg, i) => {
                                if (seg.type === "unchanged")
                                  return <span key={i}>{seg.text}</span>;
                                if (seg.type === "removed")
                                  return (
                                    <span
                                      key={i}
                                      className="line-through decoration-studio-scoreRed/70 decoration-2 text-studio-scoreRed/80 bg-studio-scoreRed/5 px-0.5"
                                    >
                                      {seg.text}
                                    </span>
                                  );
                                return (
                                  <span
                                    key={i}
                                    className="underline decoration-studio-scoreGreen decoration-2 underline-offset-4 text-studio-scoreGreen bg-studio-scoreGreen/5 px-0.5"
                                  >
                                    {seg.text}
                                  </span>
                                );
                              })}
                            </p>
                          )
                        ) : (
                          // 0 changes: show the copy plainly under the celebration banner above
                          <MarkdownText
                            text={currentCandidate || pastedCopy}
                            className="text-studio-ink text-base leading-relaxed"
                          />
                        ))}

                      {effectiveMode === "diff" && hasChanges && (
                        <div className="mt-6 flex items-center gap-3 text-[11px] text-studio-muted/85 tracking-wide">
                          <span>{changeCount} changes</span>
                          <span className="text-studio-border">·</span>
                          <span>
                            <kbd className="font-sans text-[10px] px-1.5 py-0.5 rounded bg-studio-border/40 text-studio-muted">
                              ⌘K
                            </kbd>{" "}
                            to refine
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </>
              );
            })()}
          </div>

          {/* Save to history — commits the current candidate (refine result or
            manual override) as a new version in the active chat AND accepts it
            (locks the view to the refined copy). "Refine Again" reopens iteration. */}
          <div className="self-end mt-4 flex items-center gap-2">
            {canDiscard && (
              <button
                type="button"
                onClick={handleDiscard}
                disabled={saving || !isDirty}
                title="Discard changes and reset to the last saved version"
                className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-md text-sm text-studio-mutedSoft hover:text-studio-ink hover:bg-studio-cardSubtle disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Undo2 className="h-4 w-4" />
                Discard changes
              </button>
            )}
            <Button
              onClick={handleSaveClick}
              disabled={
                saving || justSaved || !currentCandidate.trim() || !isDirty
              }
              className="bg-studio-ink hover:bg-studio-muted text-studio-page rounded-md h-10 px-5 text-sm font-medium"
            >
              {justSaved ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Saved to history
                </>
              ) : saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save to history
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Warn before saving from an earlier version — it discards newer ones. */}
      <AlertDialog
        open={confirmOverwriteOpen}
        onOpenChange={setConfirmOverwriteOpen}
      >
        <AlertDialogContent className="bg-studio-page border-studio-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-studio-ink">
              Overwrite newer versions?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-studio-muted">
              You&rsquo;re working from version {(activeVersionIndex ?? 0) + 1},
              which isn&rsquo;t the latest. Saving now will discard the{" "}
              {futureCount} later version{futureCount === 1 ? " " : "s "} in
              this chat&rsquo;s history. This can&rsquo;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-0 bg-transparent shadow-none text-studio-mutedSoft hover:bg-studio-cardSubtle hover:text-studio-ink">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOverwriteOpen(false);
                void handleSaveVersion();
              }}
              className="bg-red-400 hover:bg-red-600 text-studio-page"
            >
              Overwrite &amp; Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LensCard({
  label,
  current,
  previous,
  loading,
  active,
  hasRationale,
  onClick,
}: {
  label: string;
  current?: number;
  previous?: number;
  loading?: boolean;
  active?: boolean;
  hasRationale?: boolean;
  onClick?: () => void;
}) {
  // While (re)scoring, show a spinner in place of the score number, keeping the
  // "/100" and the "from xx/100" baseline so the delta context stays visible.
  // Show the baseline whenever a prior score exists — including when it's equal
  // to the current score (a refine that held a lens steady still has context).
  const showPrevious = previous != null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-expanded={hasRationale ? !!active : undefined}
      className={`text-left space-y-1.5 rounded-lg border p-3 transition-colors ${
        active
          ? "border-studio-ink bg-studio-cardSubtle"
          : "border-studio-border"
      } ${onClick ? "hover:bg-studio-cardSubtle cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-center justify-between gap-1">
        <h4 className="font-bold text-sm text-studio-ink">{label}</h4>
        {hasRationale && (
          <ChevronDown
            className={`h-4 w-4 text-studio-mutedSoft flex-shrink-0 transition-transform ${active ? "rotate-180" : ""}`}
          />
        )}
      </div>
      {loading ? (
        <p className="text-2xl font-bold leading-none flex items-center gap-1 text-studio-mutedSoft">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>/100</span>
        </p>
      ) : (
        <p
          className={`text-2xl font-bold leading-none ${current != null ? scoreColorClass(current) : "text-studio-mutedSoft"}`}
        >
          {current != null ? `${current}/100` : "X/100"}
        </p>
      )}
      {showPrevious && (
        <p className="text-xs italic text-studio-mutedSoft">
          from {previous}/100
        </p>
      )}
    </button>
  );
}

// Join an array of per-change rationale strings into a single paragraph. Keeps
// the narrow right-rail column from feeling list-heavy; preserves agent's prose.
function joinChanges(items: string[]): string {
  return items.join(" ");
}

function pickWhyThisMatters(
  result: ReviewResult,
  channel: string,
  audience: string,
): string {
  const lenses: Array<["voice" | "messaging" | "strategy", LensEntry]> = [
    ["voice", result.scorecard.voice],
    ["messaging", result.scorecard.messaging],
    ["strategy", result.scorecard.strategy],
  ];
  const weakest = lenses
    .filter(([, s]) => s.rationale)
    .sort(
      (a, b) => lensScore(a[1], a[0]).score - lensScore(b[1], b[0]).score,
    )[0];
  if (weakest && weakest[1].rationale) return weakest[1].rationale;
  if (channel || audience)
    return `Original would land flat with ${audience || "this audience"}${channel ? ` on ${channel}` : ""}. The refined version restores brand fit across all three lenses.`;
  return "The refined version restores brand fit across Voice, Messaging, and Strategy.";
}
