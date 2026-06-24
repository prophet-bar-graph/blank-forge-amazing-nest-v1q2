import React from "react";
import { cn } from "@/lib/utils";

// Lightweight markdown renderer for copy previews. Handles the subset agents
// actually emit: paragraphs + line breaks, ATX headings, bullet/numbered
// lists, and inline **bold** / __bold__ / *italic* / [text](url). Deliberately
// dependency-free — the copy is short and the grammar is small.

const INLINE_RE =
  /\*\*([^*]+?)\*\*|__([^_]+?)__|\*([^*\n]+?)\*|\[([^\]]+?)\]\(([^)\s]+?)\)/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] != null || m[2] != null) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`}>{m[1] ?? m[2]}</strong>);
    } else if (m[3] != null) {
      nodes.push(<em key={`${keyPrefix}-i${i}`}>{m[3]}</em>);
    } else if (m[4] != null) {
      nodes.push(
        <a
          key={`${keyPrefix}-l${i}`}
          href={m[5]}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {m[4]}
        </a>,
      );
    }
    last = INLINE_RE.lastIndex;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function MarkdownText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const blocks = (text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .filter((b) => b.trim());

  return (
    <div className={cn("space-y-3", className)}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n");

        const isBulleted = lines.every(
          (l) => l.trim() === "" || /^\s*[-*+]\s+/.test(l),
        );
        const isNumbered = lines.every(
          (l) => l.trim() === "" || /^\s*\d+[.)]\s+/.test(l),
        );
        if ((isBulleted || isNumbered) && lines.some((l) => l.trim())) {
          const items = lines
            .filter((l) => l.trim())
            .map((l) => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ""));
          const ListTag = isNumbered ? "ol" : "ul";
          return (
            <ListTag
              key={bi}
              className={
                isNumbered
                  ? "list-decimal pl-6 space-y-1"
                  : "list-disc pl-6 space-y-1"
              }
            >
              {items.map((it, ii) => (
                <li key={ii}>{renderInline(it, `${bi}-${ii}`)}</li>
              ))}
            </ListTag>
          );
        }

        const heading = block.match(/^#{1,6}\s+([\s\S]*)$/);
        if (heading) {
          return (
            <p key={bi} className="font-bold">
              {renderInline(heading[1].trim(), `h${bi}`)}
            </p>
          );
        }

        // Paragraph: preserve single newlines as <br/>.
        return (
          <p key={bi}>
            {lines.map((line, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(line, `${bi}-${li}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
