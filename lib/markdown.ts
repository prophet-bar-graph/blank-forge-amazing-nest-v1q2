// Strip markdown emphasis + heading markers so generated/refined copy renders
// as clean plain text (the copy is meant to be pasted into email/social where
// markdown wouldn't render). Conservative: only unwraps **/*/_ emphasis and
// leading # heading markers; leaves ordinary punctuation and snake_case intact.
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*{3}([^*\n]+?)\*{3}/g, "$1")
    .replace(/\*{2}([^*\n]+?)\*{2}/g, "$1")
    .replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, "$1")
    // Orphan ** left at a token boundary by unbalanced agent output.
    .replace(/(^|\s)\*{2}(?=\s|$)/g, "$1")
    .replace(/_{3}([^_\n]+?)_{3}/g, "$1")
    .replace(/_{2}([^_\n]+?)_{2}/g, "$1")
    // _italic_ only when bounded by non-word chars (so snake_case / URLs survive).
    .replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, "$1")
    // Leading ATX heading markers ("## Foo" -> "Foo").
    .replace(/^#{1,6}[ \t]+/gm, "")
    .trim();
}

// ---- Markdown → HTML (for rich-text clipboard copy) ----
// Mirrors components/MarkdownText.tsx's grammar so the copied HTML matches the
// preview: paragraphs/line breaks, headings, bullet/numbered lists, and inline
// **bold** / __bold__ / *italic* / [text](url).

const INLINE_RE =
  /\*\*([^*]+?)\*\*|__([^_]+?)__|\*([^*\n]+?)\*|\[([^\]]+?)\]\(([^)\s]+?)\)/g;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineToHtml(text: string): string {
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) out += escapeHtml(text.slice(last, m.index));
    if (m[1] != null || m[2] != null) {
      out += `<strong>${escapeHtml(m[1] ?? m[2] ?? "")}</strong>`;
    } else if (m[3] != null) {
      out += `<em>${escapeHtml(m[3])}</em>`;
    } else if (m[4] != null) {
      out += `<a href="${escapeHtml(m[5])}">${escapeHtml(m[4])}</a>`;
    }
    last = INLINE_RE.lastIndex;
  }
  if (last < text.length) out += escapeHtml(text.slice(last));
  return out;
}

export function markdownToHtml(text: string): string {
  const blocks = (text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .filter((b) => b.trim());

  return blocks
    .map((block) => {
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
        const tag = isNumbered ? "ol" : "ul";
        return `<${tag}>${items.map((it) => `<li>${inlineToHtml(it)}</li>`).join("")}</${tag}>`;
      }
      const heading = block.match(/^(#{1,6})\s+([\s\S]*)$/);
      if (heading) {
        const level = Math.min(heading[1].length, 6);
        return `<h${level}>${inlineToHtml(heading[2].trim())}</h${level}>`;
      }
      return `<p>${lines.map((l) => inlineToHtml(l)).join("<br>")}</p>`;
    })
    .join("");
}
