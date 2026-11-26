// Pure sort logic: no Obsidian imports, so it can be tested with `deno test`.
// The rules 1–6 named below are in SPEC.md, "Sorting links".

import { URL_RE } from "./links.ts";

/** Sort key of a web link (rule 3; SPEC.md "Sort key"). */
function webLinkKey(url: string): string {
  // The query and the anchor go first, so punctuation in front of them goes too ("docs.?x=1").
  const cleaned = url.replace(/[?#].*$/, "").replace(/[/.,;:!]+$/, "");
  const part = cleaned.slice(cleaned.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(part);
  } catch {
    // A broken "%" code (for example "100%") cannot be decoded: keep the text as it is.
    return part;
  }
}

/**
 * Natural order of two sort keys: punctuation, then digits (numbers by value, so "2-tips" comes
 * before "10-tips"), then letters. "alpha" and "Alpha" are equal, so are "éclair" and "eclair".
 */
export const compareKeys = new Intl.Collator("en", { numeric: true, sensitivity: "base" }).compare;

// One list marker with the spaces after it ("- ", "1. "). Shared by LINK_LINE_RE (rule 1) and
// LIST_MARKERS_RE (rule 5), so both find the same list markers.
const LIST_MARKER = String.raw`(?:[-*+]|\d+[.)])[ \t]+`;

// A link line (rule 1). Built from URL_RE's source and flags, so capital letters count
// ("HTTPS://…"), and with no `g` flag, so it keeps no position between lines.
const LINK_LINE_RE = new RegExp(
  String.raw`^(?<start>[ \t]*(?<marker>${LIST_MARKER})?)` +
    String.raw`(?<rest>(?<box>\[[ xX]\][ \t]+)?(?<url>${URL_RE.source}))(?<end>[ \t]*)$`,
  URL_RE.flags,
);

/** A link line in parts: `start` and `end` stay in the place, `rest` moves (rule 4). */
export interface LinkLine {
  /** Indent and list marker with the spaces after it. */
  start: string;
  /** Task box and link. */
  rest: string;
  /** Spaces or tabs at the line end. */
  end: string;
  /** Sort key of the link (rule 3). */
  key: string;
  /** True when the line has a list marker (rule 2). */
  marked: boolean;
}

/** The line as a link line, or null when it is not one. */
export function linkLine(text: string): LinkLine | null {
  const groups = LINK_LINE_RE.exec(text)?.groups;
  // A task box counts only after a list marker: "[ ] https://…" alone is not a link line.
  if (!groups || (groups.box !== undefined && groups.marker === undefined)) return null;
  return {
    start: groups.start,
    rest: groups.rest,
    end: groups.end,
    key: webLinkKey(groups.url),
    marked: groups.marker !== undefined,
  };
}

// All list markers at the start of a line ("- ", "1. ", also nested ones as "- 1. "): a fence
// may come after them.
const LIST_MARKERS_RE = new RegExp("^(?:" + LIST_MARKER + ")+");

/** The run of ` or ~ that opens a code block on this line (rule 5), or null. */
function openingFence(text: string): string | null {
  const line = text.replace(/^[ \t]+/, "").replace(LIST_MARKERS_RE, "");
  const run = line.match(/^(?:`{3,}|~{3,})/)?.[0];
  // A backtick fence has no backtick after it, so "```a``` text" is inline code.
  if (!run || (run[0] === "`" && line.slice(run.length).includes("`"))) return null;
  return run;
}

/** True when the line closes the code block that `fence` opened (rule 5). */
function closesFence(text: string, fence: string): boolean {
  const trimmed = text.replace(/^[ \t]+|[ \t]+$/g, "");
  return trimmed.length >= fence.length && trimmed === fence[0].repeat(trimmed.length);
}

/** For each line, true when it is in the frontmatter or in a fenced code block (rule 5). */
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

interface SortResult {
  content: string;
  /** How many link lines the note has (rule 6). */
  links: number;
  /** True when the sorted note differs from the old one. */
  changed: boolean;
}

/** Sorts each block of link lines on its own (rules 1–6); every other line stays as it is. */
export function sortLinkLines(content: string): SortResult {
  // An invisible byte order mark at the very start stays there: it is not part of line 1.
  const bom = content.startsWith("\uFEFF") ? "\uFEFF" : "";
  const lines = content.slice(bom.length).split("\n");
  const endings = lines.map((line) => (line.endsWith("\r") ? "\r" : ""));
  const texts = lines.map((line, i) => line.slice(0, line.length - endings[i].length));
  const skipped = skippedLines(texts);

  const blocks: (LinkLine & { line: number })[][] = [];
  let above: LinkLine | null = null;
  for (let i = 0; i < texts.length; i++) {
    // A skipped line is not a link line, so it ends a block.
    const link = skipped[i] ? null : linkLine(texts[i]);
    if (link) {
      // A new block starts under a line that is not a link line, and where the list marker
      // comes or goes.
      if (above === null || above.marked !== link.marked) blocks.push([]);
      blocks[blocks.length - 1].push({ ...link, line: i });
    }
    above = link;
  }

  for (const block of blocks) {
    // Array sort is stable: lines with the same key keep their old order.
    const sorted = [...block].sort((a, b) => compareKeys(a.key, b.key));
    block.forEach(({ line, start, end }, n) => {
      lines[line] = start + sorted[n].rest + end + endings[line];
    });
  }
  const newContent = bom + lines.join("\n");
  const links = blocks.reduce((count, block) => count + block.length, 0);
  return { content: newContent, links, changed: newContent !== content };
}

/** A place in the note text: line and character, both counted from 0 (as in the editor). */
interface Position {
  line: number;
  ch: number;
}

/** One line to replace in the editor: from its start to its end, with the new text. */
export interface LineChange {
  from: Position;
  to: Position;
  text: string;
}

/**
 * The changes that turn `before` into `after`, one per line that differs. A sort keeps the
 * number of lines, so line n of `after` replaces line n of `before`; any other input throws.
 * All positions refer to `before`, so the changes can go into one editor transaction. A "\r"
 * at a line end is not part of a change: each place keeps its own line ending.
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
