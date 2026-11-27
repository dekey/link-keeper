// Pure sort logic, no Obsidian imports. Rules 1–6: SPEC.md, "Sorting links".

import { URL_RE } from "./links.ts";

/** Sort key of a web link: its last part (rule 3). */
function webLinkKey(url: string): string {
  const cleaned = url.replace(/[?#].*$/, "").replace(/[/.,;:!]+$/, "");
  const part = cleaned.slice(cleaned.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(part);
  } catch {
    return part; // broken "%" code, e.g. "100%"
  }
}

/** Punctuation, then numbers by value, then letters; case and accents ignored. */
export const compareKeys = new Intl.Collator("en", { numeric: true, sensitivity: "base" }).compare;

const LIST_MARKER = String.raw`(?:[-*+]|\d+[.)])[ \t]+`;

// Rule 1. Takes URL_RE's flags, so "HTTPS://…" counts.
const LINK_LINE_RE = new RegExp(
  String.raw`^(?<start>[ \t]*(?<marker>${LIST_MARKER})?)` +
    String.raw`(?<rest>(?<box>\[[ xX]\][ \t]+)?(?<url>${URL_RE.source}))(?<end>[ \t]*)$`,
  URL_RE.flags,
);

/** A link line: `start` and `end` stay in place, `rest` moves (rule 4). */
export interface LinkLine {
  start: string;
  rest: string;
  end: string;
  key: string;
  marked: boolean;
}

export function linkLine(text: string): LinkLine | null {
  const groups = LINK_LINE_RE.exec(text)?.groups;
  // A task box needs a list marker in front.
  if (!groups || (groups.box !== undefined && groups.marker === undefined)) return null;
  return {
    start: groups.start,
    rest: groups.rest,
    end: groups.end,
    key: webLinkKey(groups.url),
    marked: groups.marker !== undefined,
  };
}

const LIST_MARKERS_RE = new RegExp("^(?:" + LIST_MARKER + ")+");

/** The ``` or ~~~ run that opens a code block (rule 5), or null. */
function openingFence(text: string): string | null {
  const line = text.replace(/^[ \t]+/, "").replace(LIST_MARKERS_RE, "");
  const run = line.match(/^(?:`{3,}|~{3,})/)?.[0];
  // "```a``` text" is inline code, not a fence.
  if (!run || (run[0] === "`" && line.slice(run.length).includes("`"))) return null;
  return run;
}

function closesFence(text: string, fence: string): boolean {
  const trimmed = text.replace(/^[ \t]+|[ \t]+$/g, "");
  return trimmed.length >= fence.length && trimmed === fence[0].repeat(trimmed.length);
}

/** True for each line in the frontmatter or a fenced code block (rule 5). */
function skippedLines(texts: string[]): boolean[] {
  const frontmatterEnd = texts[0] === "---" ? texts.indexOf("---", 1) : -1;
  let fence: string | null = null;
  return texts.map((text, i) => {
    if (i <= frontmatterEnd) return true;
    if (fence) {
      if (closesFence(text, fence)) fence = null;
      return true;
    }
    fence = openingFence(text);
    return fence !== null;
  });
}

export interface SortResult {
  content: string;
  links: number;
  changed: boolean;
}

/** Sorts each block of link lines on its own; other lines stay. */
export function sortLinkLines(content: string): SortResult {
  const bom = content.startsWith("\uFEFF") ? "\uFEFF" : "";
  const lines = content.slice(bom.length).split("\n");
  const endings = lines.map((line) => (line.endsWith("\r") ? "\r" : ""));
  const texts = lines.map((line, i) => line.slice(0, line.length - endings[i].length));
  const skipped = skippedLines(texts);

  const blocks: (LinkLine & { line: number })[][] = [];
  let above: LinkLine | null = null;
  for (let i = 0; i < texts.length; i++) {
    const link = skipped[i] ? null : linkLine(texts[i]);
    if (link) {
      // A new block starts after a non-link line or when the list marker comes or goes.
      if (above === null || above.marked !== link.marked) blocks.push([]);
      blocks[blocks.length - 1].push({ ...link, line: i });
    }
    above = link;
  }

  for (const block of blocks) {
    const sorted = [...block].sort((a, b) => compareKeys(a.key, b.key)); // stable
    block.forEach(({ line, start, end }, n) => {
      lines[line] = start + sorted[n].rest + end + endings[line];
    });
  }
  const newContent = bom + lines.join("\n");
  const links = blocks.reduce((count, block) => count + block.length, 0);
  return { content: newContent, links, changed: newContent !== content };
}

interface Position {
  line: number;
  ch: number;
}

export interface LineChange {
  from: Position;
  to: Position;
  text: string;
}

/**
 * One change per changed line, positions in `before`, "\r" left out. Throws when the line
 * count differs.
 */
export function lineChanges(before: string, after: string): LineChange[] {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  if (oldLines.length !== newLines.length) {
    throw new Error(`line count changed: ${oldLines.length} → ${newLines.length}`);
  }
  const changes: LineChange[] = [];
  oldLines.forEach((line, n) => {
    const oldText = line.replace(/\r$/, "");
    const newText = newLines[n].replace(/\r$/, "");
    if (oldText !== newText) {
      changes.push({
        from: { line: n, ch: 0 },
        to: { line: n, ch: oldText.length },
        text: newText,
      });
    }
  });
  return changes;
}
