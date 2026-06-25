"use client";

import React, { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  RotateCcw,
  Check,
  Copy as CopyIcon,
  AlertCircle,
} from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";
import LoadingWords from "@/components/LoadingWords";
import { useBrandProfile } from "@/components/BrandProfileProvider";
import { useChatHistory } from "@/components/ChatHistoryProvider";
import { emptyBrandProfile } from "@/lib/brandProfile";
import { buildBrandContextBlock } from "@/lib/brandContextPrompt";
import { scoreColorClass } from "@/lib/brandScore";
import { stripMarkdown } from "@/lib/markdown";
import { MarkdownText } from "@/components/MarkdownText";
import { overallScore } from "@/lib/brandScore";
import { CHANNELS } from "@/lib/channels";
import { StepEyebrow } from "@/components/StepEyebrow";

const COMPOSE_LOADING_WORDS = [
  "Listening",
  "Anchoring",
  "Composing",
  "Weaving",
  "Voicing",
  "Calibrating",
  "Distilling",
  "Sharpening",
  "Surfacing",
];

// ---- Types ----

type LensScores = { voice: number; messaging: number; strategy: number };
type LensEntry = { score?: number; rationale: string };
type Scorecard = {
  voice: LensEntry;
  messaging: LensEntry;
  strategy: LensEntry;
};
type Variation = {
  label: string;
  differentiator: string;
  copy: string;
  scores?: LensScores;
  word_count?: number;
  scorecard?: Scorecard;
};
type WriteResult = {
  variations: Variation[];
  raw: string;
};

interface WriteSectionProps {
  channel: string;
  audience: string;
  onCallAgent: (prompt: string) => Promise<any>;
  loading: boolean;
  onSendToRefine: (copy: string, scores?: LensScores) => void;
  onChannelChange: (channel: string) => void;
  onAudienceChange: (audience: string) => void;
  composeAbortControllerRef?: React.MutableRefObject<AbortController | null>;
}

// ---- Parsing: prefer structured data, fall back to markdown extraction ----

function parseStructured(response: any): Variation[] {
  // Path 1: response.data.variations (top-level)
  let variations = response?.data?.variations;
  // Path 2: response.response is a JSON string with .data.variations inside
  if (!Array.isArray(variations) && typeof response?.response === "string") {
    try {
      const inner = JSON.parse(response.response);
      if (Array.isArray(inner?.data?.variations))
        variations = inner.data.variations;
    } catch {}
  }
  if (!Array.isArray(variations)) return [];
  return variations.map((v: any, i: number): Variation => {
    const scores = v?.scores || v?.score;
    const parsedScores: LensScores | undefined =
      scores && typeof scores === "object"
        ? {
            voice: Number(scores.voice ?? scores.voice_score ?? 0) || 0,
            messaging:
              Number(scores.messaging ?? scores.messaging_score ?? 0) || 0,
            strategy:
              Number(scores.strategy ?? scores.strategy_score ?? 0) || 0,
          }
        : typeof v?.voice_score === "number" ||
            typeof v?.messaging_score === "number"
          ? {
              voice: Number(v.voice_score || 0),
              messaging: Number(v.messaging_score || 0),
              strategy: Number(v.strategy_score || 0),
            }
          : undefined;

    const scorecard = v?.scorecard ? {
      voice: {
        score: Number(v.scorecard.voice?.score ?? v.scorecard.voice?.voice_score ?? 0),
        rationale: v.scorecard.voice?.rationale ?? "",
      },
      messaging: {
        score: Number(v.scorecard.messaging?.score ?? v.scorecard.messaging?.messaging_score ?? 0),
        rationale: v.scorecard.messaging?.rationale ?? "",
      },
      strategy: {
        score: Number(v.scorecard.strategy?.score ?? v.scorecard.strategy?.strategy_score ?? 0),
        rationale: v.scorecard.strategy?.rationale ?? "",
      },
    } : undefined;

    return {
      label: v?.label || `Option ${i + 1}`,
      differentiator: v?.differentiator || v?.style || "",
      copy: v?.copy || v?.text || "",
      scores: parsedScores,
      word_count: typeof v?.word_count === "number" ? v.word_count : undefined,
      scorecard,
    };
  });
}

function parseMarkdownFallback(text: string): Variation[] {
  if (!text.trim()) return [];
  // Trim everything from the trailing breakdown / scorecard / commentary section onward
  const tailCutRe =
    /\n\s*(?:#+\s*)?(?:Three[- ]?Lens(?:\s+Breakdown)?|Brand\s+Voice\s+Breakdown|Strategy\s+Breakdown|Three[- ]?Lens\s+Scorecard|Scorecard|Annotations|Commentary|Notes\s+on\s+choices)\b[\s\S]*$/i;
  const trimmed = text.replace(tailCutRe, "").trim();

  // Find each Option header: capture the START position so the previous block's body ends cleanly.
  const optionRe =
    /(?:^|\n)\s*(?:#+\s*)?\*{0,2}\s*(?:Option|Variation|Version)\s*(\d+)\s*[:\--]\s*([^*\n]*?)\s*\*{0,2}\s*(?=\n|$)/gi;
  type Hit = {
    headerStart: number;
    bodyStart: number;
    n: string;
    diff: string;
  };
  const hits: Hit[] = [];
  let m: RegExpExecArray | null;
  while ((m = optionRe.exec(trimmed)) !== null) {
    // m.index points at the leading newline (or 0 at start). Skip whitespace/newlines to get the actual header start.
    const headerStart = m.index + (m[0].match(/^\s*/)?.[0].length ?? 0);
    const bodyStart = m.index + m[0].length;
    hits.push({
      headerStart,
      bodyStart,
      n: m[1],
      diff: m[2].trim().replace(/\*+/g, "").trim(),
    });
  }
  if (hits.length < 2) return [];

  return hits.map((h, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].headerStart : trimmed.length;
    const body = trimmed
      .slice(h.bodyStart, end)
      .trim()
      .replace(/^---+$/gm, "")
      // Belt-and-suspenders: strip any trailing partial "Option N: ..." that snuck in
      .replace(/\n\s*\*{0,2}\s*Option\s+\d+\s*[:\-]?[^\n]*\*{0,2}\s*$/i, "")
      .trim();
    return { label: `Option ${h.n}`, differentiator: h.diff, copy: body };
  });
}

function deepText(value: any, depth = 0): string {
  if (depth > 5) return typeof value === "string" ? value : "";
  if (typeof value === "string") {
    // Lyzr sometimes wraps responses as JSON-stringified envelopes: '{"response": "..."}'.
    // Peek and recurse so the parser receives unwrapped markdown rather than a JSON blob.
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return deepText(JSON.parse(trimmed), depth + 1);
      } catch {}
    }
    return value
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of [
      "response",
      "text",
      "message",
      "content",
      "result",
      "output",
    ]) {
      if (key in value && value[key] != null) {
        const t = deepText(value[key], depth + 1);
        if (t) return t;
      }
    }
  }
  return "";
}

function parseWriteResponse(response: any): WriteResult {
  const structured = parseStructured(response);
  if (structured.length > 0)
    return { variations: structured, raw: deepText(response) };
  const text = deepText(response);
  return { variations: parseMarkdownFallback(text), raw: text };
}

// ---- Heuristic score fallback (only used if agent didn't return scores) ----

function heuristicScores(
  copy: string,
  mandatories: string[],
  i: number,
): LensScores {
  const wordCount = copy.split(/\s+/).filter(Boolean).length;
  const voiceBase = wordCount > 30 && wordCount < 250 ? 78 : 64;
  const messagingBase =
    mandatories.length > 0 &&
    mandatories.some((p) => p && copy.toLowerCase().includes(p.toLowerCase()))
      ? 82
      : 70;
  const strategyBase = 75;
  // Variation-specific seed so they don't all read identically
  const seeds: ReadonlyArray<readonly [number, number, number]> = [
    [0, 4, -3],
    [-2, -1, 2],
    [3, -3, 1],
  ];
  const seed = seeds[i % 3];
  return {
    voice: Math.max(40, Math.min(99, voiceBase + seed[0])),
    messaging: Math.max(40, Math.min(99, messagingBase + seed[1])),
    strategy: Math.max(40, Math.min(99, strategyBase + seed[2])),
  };
}

// ---- Mandatory phrase highlighter ----

// Detect email format and split into subject + body. Handles multiple shapes the agent emits:
//   **Subject:** Hello\n\n**Body:**\n\nContent...
//   **Subject: Hello**\n\nContent...
//   Subject: Hello\n\nContent...
// Returns subject=null if no Subject: line is found near the top.
function parseEmailFormat(copy: string): {
  subject: string | null;
  body: string;
} {
  const subjectRe = /^\s*\*{0,2}\s*Subject\s*\*{0,2}\s*:\s*(.+?)(?:\*{0,2})?\s*(?:\n|$)/i;
  const m = copy.match(subjectRe);
  if (!m) return { subject: null, body: copy };
  let subject = m[1].trim().replace(/\*+$/, ""); // Remove trailing asterisks
  // Strip the matched Subject line, then optionally a Body: label (with or without content on same line)
  let body = copy
    .slice(m[0].length)
    .replace(/^\s*\*{0,2}\s*Body\s*\*{0,2}\s*:\s*\n*/i, "");
  return { subject, body: body.trim() };
}

function HighlightedCopy({
  copy,
  mandatories,
}: {
  copy: string;
  mandatories: string[];
}) {
  const matches = mandatories.map((s) => s.trim()).filter(Boolean);
  if (!matches.length) return <span>{copy}</span>;
  // Build a single regex that matches any mandatory, longest first to prefer specific matches
  const escaped = matches
    .sort((a, b) => b.length - a.length)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = copy.split(re);
  return (
    <>
      {parts.map((p, i) => {
        const isMatch = i % 2 === 1;
        return isMatch ? (
          <mark
            key={i}
            className="bg-studio-scoreGold/20 text-studio-ink underline decoration-studio-scoreGold/70 underline-offset-[3px] decoration-2 px-0.5 rounded-sm"
          >
            {p}
          </mark>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        );
      })}
    </>
  );
}

// ---- UI ----

export default function WriteSection({
  channel,
  audience,
  onCallAgent,
  loading,
  onSendToRefine,
  onChannelChange,
  onAudienceChange,
  composeAbortControllerRef,
}: WriteSectionProps) {
  const { profile } = useBrandProfile();
  const { createChat, saveVersion } = useChatHistory();
  const brand = profile || emptyBrandProfile();
  // Derived placeholder examples + sidebar pills. All read from BrandProfile
  // with sensible generic fallbacks if a particular field is empty.
  const placeholderContentType = brand.portfolioPillars?.[0]
    ? `Email to ${brand.portfolioPillars[0]} prospects`
    : "Email to prospects";
  const placeholderSupporting =
    brand.partnerPillars?.[1] ||
    brand.partnerPillars?.[0] ||
    "Key supporting message";
  const placeholderCta = brand.callToAction || "Discover more";

  const [contentObjective, setContentObjective] = useState("");
  const [supportingMessages, setSupportingMessages] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [mandatories, setMandatories] = useState<string[]>([]);
  const [tone, setTone] = useState(5);
  const [result, setResult] = useState<WriteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [regeneratingDiff, setRegeneratingDiff] = useState<string | null>(null);
  // Carousel index — single-variant view in the middle Copy column. Reset to 0
  // on each fresh generation so the user always lands on variant 1.
  const [carouselIndex, setCarouselIndex] = useState(0);

  const handleGenerate = async () => {
    if (!contentObjective.trim() || !supportingMessages.trim()) return;
    setError(null);
    const prompt = [
      buildBrandContextBlock(brand),
      `Channel: ${channel || "Non-Specific"}`,
      `Audience: ${audience || "general"}`,
      `Tone Intensity: ${tone}/10`,
      `Content Objective: ${contentObjective}`,
      supportingMessages ? `Supporting Messages: ${supportingMessages}` : "",
      callToAction ? `Call to Action: ${callToAction}` : "",
      mandatories.length
        ? `Mandatory phrases (must appear verbatim, at least once across the variations): ${mandatories.join(" | ")}`
        : "",
      "",
      'Generate three on-brand copy variations per the Brand Voice & Messaging instructions. Return JSON with mode="write" and data.variations[] containing label, differentiator (Hook-led / Solution-led / Story-led), copy, scores ({voice, messaging, strategy} each an object with integer score 0-100 and rationale string), and word_count.',
    ]
      .filter(Boolean)
      .join("\n");
    const response = await onCallAgent(prompt);
    if (response) {
      // Check if the response indicates cancellation
      if (response.error === 'Polling cancelled') {
        setError(null); // Don't show an error for cancellation
        return;
      }
      const parsed = parseWriteResponse(response);
      setResult(parsed);
      setCarouselIndex(0);
      // Variations are kept in state during composition. A chat is only created
      // when the user explicitly sends a variant to Refine, which keeps the
      // sidebar clean and only shows work that's been actively refined.
    } else {
      setError("Failed to generate variants. Please try again.");
    }
  };

  const enrichedVariations = useMemo(() => {
    if (!result) return [];
    return result.variations
      .map((v, i) => {
        const scores = v.scores || heuristicScores(v.copy, mandatories, i);
        const wordCount =
          v.word_count ?? v.copy.split(/\s+/).filter(Boolean).length;
        const fit = scores.voice + scores.messaging + scores.strategy;
        return { ...v, scores, word_count: wordCount, fit };
      })
      .sort((a, b) => b.fit - a.fit);
  }, [result, mandatories]);

  const handleRegenerateOne = async (
    differentiator: string,
    previousCopy: string,
  ) => {
    if (!contentObjective.trim() || !supportingMessages.trim() || !result)
      return;
    setRegeneratingDiff(differentiator);
    setError(null);
    const prompt = [
      buildBrandContextBlock(brand),
      `Channel: ${channel || "Non-Specific"}`,
      `Audience: ${audience || "general"}`,
      `Tone Intensity: ${tone}/10`,
      `Content Objective: ${contentObjective}`,
      supportingMessages ? `Supporting Messages: ${supportingMessages}` : "",
      callToAction ? `Call to Action: ${callToAction}` : "",
      mandatories.length
        ? `Mandatory phrases (must appear verbatim): ${mandatories.join(" | ")}`
        : "",
      "",
      `Regenerate ONE on-brand variation in the ${differentiator} lane. The previous attempt in this lane was:`,
      previousCopy,
      "",
      `Produce a genuinely different take — different opening, different angle — while staying in the ${differentiator} lane and faithful to the brief. Return JSON with mode="write" and data.variations[] containing exactly 1 item with label "Option 1", differentiator="${differentiator}", copy, scores ({voice, messaging, strategy} integers 0-100), and word_count.`,
    ]
      .filter(Boolean)
      .join("\n");
    const response = await onCallAgent(prompt);
    if (response) {
      const parsed = parseWriteResponse(response);
      const fresh = parsed.variations[0];
      if (fresh) {
        const updatedFresh: Variation = { ...fresh, differentiator };
        setResult((prev) =>
          prev
            ? {
                ...prev,
                variations: prev.variations.map((v) =>
                  v.differentiator.toLowerCase() ===
                  differentiator.toLowerCase()
                    ? updatedFresh
                    : v,
                ),
              }
            : prev,
        );
      } else {
        setError("Regenerate returned no variations. Please try again.");
      }
    } else {
      setError("Failed to regenerate. Please try again.");
    }
    setRegeneratingDiff(null);
  };

  const handleCopy = async (variation: Variation, i: number) => {
    const ok = await copyToClipboard(variation.copy);
    if (ok) {
      setCopiedIndex(i);
      setTimeout(() => setCopiedIndex(null), 1500);
    }
  };

  // Currently displayed variant in the middle Copy carousel. Clamp the index
  // in case variations changed (e.g., heuristic re-sorting).
  const safeIndex = Math.min(
    carouselIndex,
    Math.max(0, enrichedVariations.length - 1),
  );
  const activeVariant = enrichedVariations[safeIndex];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6 lg:gap-8">
      {/* ---- BRIEF (LEFT) ---- */}
      <div className="flex flex-col">
        <StepEyebrow step={1} label="Build the Brief" />
        <section className="rounded-2xl border border-black/75 p-4 lg:p-5 flex flex-col flex-1">
          <div className="space-y-2.5 flex-1">
            {/* 1. Channel */}
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

            {/* 2. Audience */}
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

            {/* 3. Content type */}
            <div>
              <h4 className="font-bold text-sm text-studio-ink">
                Content Type:
              </h4>
              <p className="text-xs italic text-studio-mutedSoft mb-1">
                What do we want to write?
              </p>
              <Input
                value={contentObjective}
                onChange={(e) => setContentObjective(e.target.value)}
                placeholder={placeholderContentType}
                className="bg-studio-page border-studio-border text-sm text-studio-ink placeholder:text-studio-mutedSoft"
              />
            </div>

            {/* 4. Supporting messages */}
            <div>
              <h4 className="font-bold text-sm text-studio-ink">
                Supporting Messages:
              </h4>
              <p className="text-xs italic text-studio-mutedSoft mb-1">
                What are the key themes and messages to include?
              </p>
              <Input
                value={supportingMessages}
                onChange={(e) => setSupportingMessages(e.target.value)}
                placeholder={placeholderSupporting}
                className="bg-studio-page border-studio-border text-sm text-studio-ink placeholder:text-studio-mutedSoft"
              />
            </div>

            {/* 5. Call to action */}
            <div>
              <h4 className="font-bold text-sm text-studio-ink">
                Call to action:
              </h4>
              <p className="text-xs italic text-studio-mutedSoft mb-1">
                What do we want our audience to do?
              </p>
              <Input
                value={callToAction}
                onChange={(e) => setCallToAction(e.target.value)}
                placeholder={placeholderCta}
                className="bg-studio-page border-studio-border text-sm text-studio-ink placeholder:text-studio-mutedSoft"
              />
            </div>

            {/* 6. Mandatories */}
            <div>
              <div className="flex items-baseline gap-1.5">
                <h4 className="font-bold text-sm text-studio-ink">
                  Mandatories
                </h4>
                <span className="text-xs italic text-studio-mutedSoft">
                  · optional
                </span>
              </div>
              <p className="text-xs italic text-studio-mutedSoft mb-1">
                Key phrase or statistic
              </p>
              <Input
                value={mandatories.join("\n")}
                onChange={(e) =>
                  setMandatories(e.target.value ? [e.target.value] : [])
                }
                placeholder="100+ countries"
                className="bg-studio-page border-studio-border text-sm text-studio-ink placeholder:text-studio-mutedSoft"
              />
            </div>

            {/* 7. Tone */}
            <div>
              <h4 className="font-bold text-sm text-studio-ink">Tone:</h4>
              <p className="text-xs italic text-studio-mutedSoft mb-1">
                How do we want to sound?
              </p>
              <input
                type="range"
                min={1}
                max={10}
                value={tone}
                onChange={(e) => setTone(parseInt(e.target.value, 10))}
                className="w-full accent-studio-ink"
              />
              <div className="flex justify-between text-xs text-studio-mutedSoft">
                <span>subtle</span>
                <span>bold</span>
              </div>
              <p className="text-sm font-bold text-studio-ink mt-1">
                {tone}/10
              </p>
            </div>
          </div>

          {/* Generate Copy button — becomes Cancel when loading */}
          {loading ? (
            <button
              type="button"
              onClick={() => composeAbortControllerRef?.current?.abort()}
              className="h-10 px-5 mt-3 self-end inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium bg-studio-card border border-studio-border text-studio-ink hover:bg-studio-border transition-colors"
            >
              <span>Cancel</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!contentObjective.trim() || !supportingMessages.trim()}
              className="h-10 px-5 mt-3 self-end inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium bg-studio-ink text-studio-page hover:bg-studio-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span>Generate my copy</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-md bg-studio-page border border-studio-border text-xs mt-3">
              <AlertCircle className="h-3.5 w-3.5 text-studio-scoreRed flex-shrink-0" />
              <p className="text-studio-ink flex-1">{error}</p>
            </div>
          )}
        </section>
      </div>

      {/* ---- COPY (MIDDLE) — empty / loading / carousel ---- */}
      <div className="flex flex-col">
        <div className="flex items-baseline justify-between gap-3">
          <StepEyebrow step={2} label="Preview Generated Copy" />
          <p className="italic text-xs text-studio-mutedSoft mb-3">
            Use the buttons below the card to navigate options
          </p>
        </div>
        <section className="bg-studio-card rounded-2xl border border-studio-border p-4 lg:p-5 flex flex-col lg:flex-row lg:items-center flex-1 gap-3">
          {/* Left arrow */}
          {result && enrichedVariations.length > 0 && (
            <button
              type="button"
              onClick={() => setCarouselIndex(Math.max(0, carouselIndex - 1))}
              disabled={carouselIndex === 0}
              aria-label="Previous variant"
              className="hidden lg:flex items-center justify-center h-8 w-8 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-studio-border flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4 text-studio-ink" />
            </button>
          )}

          <div className="flex-1 flex flex-col min-h-0">
            {/* Empty state */}
            {!loading && !result && (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                <p className="font-bold text-base text-studio-ink">
                  Fill out the brief on the left
                </p>
                <p className="text-sm text-studio-mutedSoft mt-2 leading-relaxed">
                  After you have completed the brief, click{" "}
                  <span className="font-bold text-studio-ink">Generate</span> to
                  see three options to review{" "}
                  <span className="font-bold text-studio-ink">here</span>.
                </p>
              </div>
            )}

            {/* Loading state */}
            {loading && !result && (
              <div className="flex-1 flex flex-col gap-3">
                <p className="text-sm">
                  <LoadingWords
                    words={COMPOSE_LOADING_WORDS}
                    className="italic text-studio-mutedSoft"
                  />
                </p>
                <Skeleton className="h-4 w-2/3 bg-studio-ink/80" />
                <Skeleton className="h-5 w-full bg-studio-ink/80" />
                <Skeleton className="h-5 w-5/6 bg-studio-ink/80" />
                <Skeleton className="h-5 w-4/6 bg-studio-ink/80" />
              </div>
            )}

            {/* Result state — single variant */}
            {result && enrichedVariations.length > 0 && activeVariant && (
              <div className="flex-1 flex flex-col min-h-0">
                <VariantCard
                  key={activeVariant.differentiator || safeIndex}
                  index={safeIndex}
                  variation={activeVariant}
                  mandatories={mandatories}
                  onSendToRefine={() => {
                    // Save the selected variant as V1 when sending to Refine.
                    // This creates a new chat if one doesn't exist yet.
                    void saveVersion({
                      copy: activeVariant.copy,
                      scores: activeVariant.scores ?? null,
                      source: "compose",
                    });
                    onSendToRefine(activeVariant.copy, activeVariant.scores);
                  }}
                  onCopy={() => handleCopy(activeVariant, safeIndex)}
                  copied={copiedIndex === safeIndex}
                  onRegenerate={() =>
                    handleRegenerateOne(
                      activeVariant.differentiator,
                      activeVariant.copy,
                    )
                  }
                  regenerating={
                    regeneratingDiff?.toLowerCase() ===
                    activeVariant.differentiator.toLowerCase()
                  }
                />
              </div>
            )}

            {result && enrichedVariations.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-center px-6">
                <p className="text-sm text-studio-muted">
                  No variations parsed from the response. Check the agent log.
                </p>
              </div>
            )}
          </div>

          {/* Right arrow */}
          {result && enrichedVariations.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setCarouselIndex(
                  Math.min(enrichedVariations.length - 1, carouselIndex + 1),
                )
              }
              disabled={carouselIndex === enrichedVariations.length - 1}
              aria-label="Next variant"
              className="hidden lg:flex items-center justify-center h-8 w-8 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-studio-border flex-shrink-0"
            >
              <ArrowRight className="h-4 w-4 text-studio-ink" />
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

// ---- Variant Card v2 ----

type EnrichedVariation = Variation & {
  scores: LensScores;
  word_count: number;
  fit: number;
};

function VariantCard({
  index,
  variation,
  mandatories,
  onSendToRefine,
  onCopy,
  copied,
  onRegenerate,
  regenerating,
}: {
  index: number;
  variation: EnrichedVariation;
  mandatories: string[];
  onSendToRefine: () => void;
  onCopy: () => void;
  copied: boolean;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const labelNum = String(index + 1).padStart(2, "0");
  const diff = variation.differentiator || "Variation";

  // Email-format split: pull "Subject: ..." into a headline, the rest into body.
  // Fall back to a first-sentence split for general copy.
  const email = parseEmailFormat(variation.copy);
  let rawHeadline = "";
  let rawBody = "";
  if (email.subject) {
    rawHeadline = email.subject;
    rawBody = email.body;
  } else {
    const firstBreak = variation.copy.search(/[.?!]\s/);
    if (firstBreak > 0 && firstBreak < 200) {
      rawHeadline = variation.copy.slice(0, firstBreak + 1).trim();
      rawBody = variation.copy.slice(firstBreak + 1).trim();
    } else {
      rawBody = variation.copy;
    }
  }
  const headline = stripMarkdown(rawHeadline);
  const body = stripMarkdown(rawBody);

  return (
    <article className="bg-studio-page rounded-xl border border-studio-border p-6 flex flex-col flex-1 min-h-0">
      {/* Top row: variant pill + descriptor meta */}
      <header className="flex items-baseline justify-between gap-3 mb-4">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-studio-page border border-studio-border text-xs font-bold text-studio-ink">
          Variant {labelNum}
        </span>
        <div className="text-xs text-studio-muted">
          <span className="italic">{diff}</span>
          <span className="text-studio-mutedSoft mx-1">|</span>
          <span>{variation.word_count} words</span>
        </div>
      </header>

      {/* Lens scores row */}
      <div className="pb-3 border-b border-studio-border mb-4">
        <div className="grid grid-cols-4 gap-3">
          {(["voice", "messaging", "strategy"] as const).map((lens) => {
            const score = variation.scores[lens];
            const rationale = variation.scorecard?.[lens]?.rationale;
            return (
              <div key={lens} className="flex flex-col">
                <span className="text-xs font-bold text-studio-ink capitalize">
                  {lens}
                </span>
                <span className={`text-2xl font-bold ${scoreColorClass(score)}`}>
                  {score}
                </span>
                {rationale && (
                  <span className="text-xs text-studio-muted mt-1 leading-tight">
                    {rationale}
                  </span>
                )}
              </div>
            );
          })}
          <div className="flex flex-col">
            <span className="text-xs font-bold text-studio-ink">Overall</span>
            <span className={`text-2xl font-bold ${scoreColorClass(overallScore({
              voice: { score: variation.scores.voice },
              messaging: { score: variation.scores.messaging },
              strategy: { score: variation.scores.strategy },
            }).score)}`}>
              {overallScore({
                voice: { score: variation.scores.voice },
                messaging: { score: variation.scores.messaging },
                strategy: { score: variation.scores.strategy },
              }).score}
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 mb-4 overflow-y-auto min-h-0">
        {headline && (
          <div className="mb-3">
            <MarkdownText
              text={headline}
              className="font-bold text-base leading-snug space-y-0"
            />
          </div>
        )}
        <MarkdownText
          text={body}
          className="text-sm leading-relaxed space-y-2 text-studio-ink"
        />
      </div>

      {/* Footer actions */}
      <footer className="flex items-center justify-evenly gap-2 pt-3 border-t border-studio-border text-xs text-studio-muted">
        <ActionBtn
          icon={
            regenerating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )
          }
          label={regenerating ? "Regenerating…" : "Regenerate"}
          onClick={onRegenerate}
          disabled={regenerating}
        />
        <ActionBtn
          icon={<ArrowUpRight className="h-3 w-3" />}
          label="Send to Refine"
          onClick={onSendToRefine}
        />
        <ActionBtn
          icon={
            copied ? (
              <Check className="h-3 w-3" />
            ) : (
              <CopyIcon className="h-3 w-3" />
            )
          }
          label={copied ? "Copied" : "Copy"}
          onClick={onCopy}
        />
      </footer>
    </article>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 px-1.5 py-1 rounded transition-colors ${disabled ? "opacity-40 cursor-not-allowed" : "hover:text-studio-ink hover:bg-studio-cardSubtle"}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
