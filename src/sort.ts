// Pure sort logic: no Obsidian imports, so it can be tested with `deno test`.

import { TRAILING_PUNCTUATION, URL_RE } from "./links.ts";

// The first web address in a line. An own copy of URL_RE with the same flags but without `g`:
// it keeps no position between lines, and no other code can leave a position in it.
const FIRST_URL_RE = new RegExp(URL_RE.source, URL_RE.flags.replace("g", ""));

// A note link: [[Note]], [[Folder/Note|alias]], [[Note#Heading]].
// No `g` flag, so it keeps no position between lines.
const NOTE_LINK_RE = /\[\[([^\]]+)\]\]/;

/** Text after the last "/", or the whole text when it has no "/". */
function lastPart(text: string): string {
  return text.slice(text.lastIndexOf("/") + 1);
}

// Markdown emphasis marks glued to the end of a bare link ("**https://…**", "_…_", "~~…~~"):
// they are not part of the address.
const TRAILING_EMPHASIS = /[*_~]+$/;

/** The address without the punctuation and emphasis marks stuck to its end, in any mix. */
function trimLinkEnd(url: string): string {
  let text = url;
  let before;
  do {
    before = text;
    text = text.replace(TRAILING_PUNCTUATION, "").replace(TRAILING_EMPHASIS, "");
  } while (text !== before);
  return text;
}

/** Key of a web address: the last part of its path, without query, anchor or end slashes. */
function webLinkKey(url: string): string {
  const cleaned = trimLinkEnd(url)
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
  const part = lastPart(cleaned);
  try {
    return decodeURIComponent(part);
  } catch {
    // A broken "%" code (for example "100%") cannot be decoded: keep the text as it is.
    return part;
  }
}

/** Key of a note link (the text between [[ and ]]): the note name without folder and alias. */
function noteLinkKey(inner: string): string {
  const target = inner.split("|")[0];
  const hashAt = target.indexOf("#");
  // [[#Heading]] links to a heading in the same note: the whole heading text is the key, also
  // when it holds a "/" (a heading has no folder).
  if (hashAt === 0) return target.slice(1);
  return lastPart(hashAt === -1 ? target : target.slice(0, hashAt));
}

// A Markdown link "[title](": its title, and the "(" with any spaces or "<" after it. It has the
// `g` flag: read it only with matchAll.
const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(\s*<?/g;

/**
 * The first web address in a line and where its link starts. When that address is in the title
 * of a Markdown link ("[https://a…](https://b…)"), the link opens the address in brackets, so
 * that address is taken, and the link starts at its "[".
 */
function firstWebLink(line: string): { index: number; url: string } | null {
  const web = FIRST_URL_RE.exec(line);
  if (!web) return null;
  for (const link of line.matchAll(MARKDOWN_LINK_RE)) {
    const titleStart = link.index + 1;
    if (web.index < titleStart || web.index >= titleStart + link[1].length) continue;
    const address = FIRST_URL_RE.exec(line.slice(link.index + link[0].length));
    if (address?.index === 0) return { index: link.index, url: address[0] };
  }
  return { index: web.index, url: web[0] };
}

/**
 * The text a link line is sorted by: the last part of the first link in the line.
 * Returns null when the line has no link, so it is not a link line.
 * The key keeps its capital letters; the compare ignores them.
 */
export function sortKey(line: string): string | null {
  const web = firstWebLink(line);
  const note = NOTE_LINK_RE.exec(line);
  const webAt = web?.index ?? Infinity;
  const noteAt = note?.index ?? Infinity;
  if (web && webAt < noteAt) {
    return webLinkKey(web.url);
  }
  if (note) {
    return noteLinkKey(note[1]);
  }
  return null;
}

// One collator for all compares: numbers by value, capital letters and accents ignored.
const KEY_COLLATOR = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/**
 * Natural order of two sort keys: punctuation, then digits (numbers by value, so "2-tips" comes
 * before "10-tips"), then letters. "alpha" and "Alpha" are equal, so are "éclair" and "eclair".
 */
export function compareKeys(a: string, b: string): number {
  return KEY_COLLATOR.compare(a, b);
}

/** A fenced code block: its fence character and how many of them opened it. */
interface Fence {
  char: string;
  count: number;
}

// A list marker ("- ", "* ", "+ ", "1. ", "1) ") and the spaces after it. One source for
// LIST_MARKER_RE and LIST_START_RE, so both find the same list items.
const LIST_MARKER = String.raw`(?:[-*+]|\d+[.)])[ \t]+`;

// A list marker at the start of a line: it starts a list item, and may come before a fence, as
// in "- ```" or "1. ```".
const LIST_MARKER_RE = new RegExp("^" + LIST_MARKER);

// All list markers at the start of a line: a line can open several nested items, as "- 1. ".
const LIST_MARKERS_RE = new RegExp("^(?:" + LIST_MARKER + ")+");

/**
 * The fence a line opens (3 or more ` or ~ at its start), or null. Leading spaces and the list
 * markers before it ("- ```", "- 1. ```") are skipped. A backtick fence has no backtick after it, so "```a``` text" is inline
 * code, not a fence.
 */
function openingFence(text: string): Fence | null {
  const line = text.trimStart().replace(LIST_MARKERS_RE, "");
  const run = line.match(/^(?:`{3,}|~{3,})/)?.[0];
  if (!run || (run[0] === "`" && line.slice(run.length).includes("`"))) {
    return null;
  }
  return { char: run[0], count: run.length };
}

/** True when the line holds only the fence character, at least as many as opened the block. */
function closesFence(text: string, fence: Fence): boolean {
  const trimmed = text.trim();
  return trimmed.length >= fence.count && trimmed === fence.char.repeat(trimmed.length);
}

/** True when the line has an odd number of "%%", so it opens or closes an Obsidian comment. */
function togglesComment(text: string): boolean {
  return text.split("%%").length % 2 === 0;
}

/**
 * True when an HTML comment ("<!--") starts in the line and does not end in it. The end "-->"
 * may share its "--" with the start, as in Markdown: "<!-->" and "<!--->" start and end.
 */
function opensHtmlComment(text: string): boolean {
  const start = text.lastIndexOf("<!--");
  return start !== -1 && !text.includes("-->", start + "<!".length);
}

/**
 * True when a line inside an HTML comment ends it: it holds "-->" and does not open a new
 * comment after it, as "--> <!--" does.
 */
function closesHtmlComment(text: string): boolean {
  return text.includes("-->") && !opensHtmlComment(text);
}

/** True for the divider line under a table header, like "--- | :---:" or "|---|---|". */
function isTableDivider(text: string): boolean {
  return /^[\s|:-]+$/.test(text) && text.includes("|") && text.includes("-");
}

// A heading ("#" to "######", then a space, a tab or the line end) or a quote or callout (">").
const HEADING_OR_QUOTE_RE = /^(?:#{1,6}(?:\s|$)|>)/;

/**
 * True when a line (leading spaces and tabs skipped) starts another block: a list item, a
 * heading, a quote or callout, a code block, a comment block or an HTML comment (also one that
 * ends in the same line).
 */
function startsBlock(text: string): boolean {
  const line = text.trimStart();
  return LIST_MARKER_RE.test(line) || HEADING_OR_QUOTE_RE.test(line) || line.startsWith("<!--") ||
    openingFence(text) !== null || togglesComment(text) || opensHtmlComment(text);
}

// A numbered list marker at the start of a line, like "2. " or "3) ", with its number.
const ORDERED_MARKER_RE = /^(\d+)[.)][ \t]/;

/** True for a numbered list item that does not start at 1 ("2. …", "3) …"). */
function isNumberedNotOne(text: string): boolean {
  const number = ORDERED_MARKER_RE.exec(text.trimStart())?.[1];
  return number !== undefined && Number(number) !== 1;
}

/** True for a list item line ("- …", "1. …"), leading spaces and tabs skipped. */
function isListItem(text: string): boolean {
  return LIST_MARKER_RE.test(text.trimStart());
}

// The line under an underlined heading: only "=" or only "-". Any spaces or tabs before it, so
// an underline inside a list item (indented like the item's text) is found too.
const UNDERLINE_RE = /^[ \t]*(?:=+|-+)[ \t]*$/;

/** Width of the spaces and tabs at the start of a line; a tab goes on to the next multiple of 4. */
function indentWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    if (char === " ") width++;
    else if (char === "\t") width += 4 - (width % 4);
    else break;
  }
  return width;
}

/**
 * Column where the text of a list item starts: its indent, the markers and the spaces after
 * them ("- 1. text" holds two nested items; the text starts after both markers).
 */
function itemTextColumn(text: string): number {
  return indentWidth(text) + (LIST_MARKERS_RE.exec(text.trimStart())?.[0].length ?? 0);
}

/**
 * For each line, true when it is a line of plain text: not blank, not in a block and not the
 * start of another block. Two kinds of lines that look like a block start are text too when
 * they go on with a paragraph (the text line above, or the text of a list item above), as in
 * Markdown:
 * - a line indented 4 or more columns past where the paragraph starts ("    # x"): an indented
 *   code block cannot break a paragraph;
 * - a numbered line that does not start at 1 ("2. …"), right under a text line or indented
 *   into the list item's text: such a line cannot start a list there. Under a blank line or as
 *   the next item of a list ("1. …", then "2. …") it is a list item.
 */
function textLines(texts: string[], inBlock: boolean[]): boolean[] {
  const isText = texts.map(() => false);
  // Column where the current paragraph starts: its first line's indent, or the text column of
  // the list item it goes on with.
  let start = 0;
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    if (inBlock[i] || text.trim() === "") continue;
    const afterText = i > 0 && isText[i - 1];
    const afterItem = !afterText && i > 0 && !inBlock[i - 1] && isListItem(texts[i - 1]);
    if (!afterText) start = afterItem ? itemTextColumn(texts[i - 1]) : indentWidth(text);
    if (!startsBlock(text)) {
      isText[i] = true;
    } else if (afterText || afterItem) {
      const indent = indentWidth(text);
      isText[i] = indent >= start + 4 || (isNumberedNotOne(text) && (afterText || indent >= start));
    }
  }
  return isText;
}

/**
 * For each line, true when it is a text line of an underlined heading: a run of text lines (see
 * textLines) with a "===" or "---" line right under it. A list item can start the run when the
 * underline is indented at least to the item's text, so the underline is inside the item. As
 * in Markdown, the underline may be indented at most 3 columns past where the heading text
 * starts (the item's text, or else the first text line); with 4 or more it is plain text. A
 * "---" under a blank line, a block (table, comment) or a list item outside it is a divider.
 */
function underlinedHeadingLines(texts: string[], inBlock: boolean[]): boolean[] {
  const isText = textLines(texts, inBlock);
  const inHeading = texts.map(() => false);
  for (let u = 1; u < texts.length; u++) {
    if (inBlock[u] || !UNDERLINE_RE.test(texts[u])) continue;
    const underline = indentWidth(texts[u]);
    // The run of text lines right above the underline: lines top to u - 1.
    let top = u;
    while (top > 0 && isText[top - 1]) top--;
    // A list item right above the run holds the first line of the heading text when the
    // underline is inside the item.
    const item = top - 1;
    const startsAtItem = item >= 0 && !inBlock[item] && isListItem(texts[item]) &&
      underline >= itemTextColumn(texts[item]);
    const first = startsAtItem ? item : top;
    if (first === u) continue;
    const textColumn = startsAtItem ? itemTextColumn(texts[item]) : indentWidth(texts[top]);
    if (underline - textColumn > 3) continue;
    for (let i = first; i < u; i++) inHeading[i] = true;
  }
  return inHeading;
}

/**
 * Index of the first line after `start` that passes `test`; `texts.length` when none does.
 * It starts looking right after `start`, not at the top of the note.
 */
function firstLineAfter(texts: string[], start: number, test: (text: string) => boolean): number {
  let i = start + 1;
  while (i < texts.length && !test(texts[i])) i++;
  return i;
}

/** Index of the first line after `start` that ends the block; the last line when none does. */
function findEnd(texts: string[], start: number, isEnd: (text: string) => boolean): number {
  return Math.min(firstLineAfter(texts, start, isEnd), texts.length - 1);
}

// A divider line between parts of a note: 3 or more "-", "*" or "_" (all the same), with only
// spaces or tabs between them, like "---", "***" or "_ _ _".
const DIVIDER_LINE_RE = /^([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

/**
 * When a block starts at line `i`, the index of its last line; otherwise -1. No line in a
 * block moves. A block that is never closed runs to the end of the note.
 */
function blockEnd(texts: string[], i: number): number {
  const text = texts[i];
  // Frontmatter, as Obsidian reads it: a "---" first line and an exact "---" line that closes
  // it. A "---" at the top with no closing line is a divider, not frontmatter.
  if (i === 0 && text === "---") {
    const end = firstLineAfter(texts, i, (line) => line === "---");
    if (end < texts.length) return end;
  }
  const fence = openingFence(text);
  if (fence) {
    // A code block opened after a list marker belongs to that item, so it also ends where the
    // item ends: before the first line that is not blank and is indented less than the item's
    // text. That line is not part of the block.
    const column = isListItem(text) ? itemTextColumn(text) : 0;
    const end = firstLineAfter(
      texts,
      i,
      (line) => closesFence(line, fence) || (line.trim() !== "" && indentWidth(line) < column),
    );
    if (end < texts.length && !closesFence(texts[end], fence)) return end - 1;
    return Math.min(end, texts.length - 1);
  }
  if (togglesComment(text)) return findEnd(texts, i, togglesComment);
  if (opensHtmlComment(text)) return findEnd(texts, i, closesHtmlComment);
  // A table: a line with a divider line ("|---|", "--- | ---") under it. The header line needs
  // no "|": "Links" over "|---|" is a table with one column. Rows without an outer "|" ("x | y")
  // belong to it too. It ends before the first line after the divider that is blank, starts
  // another block or is a divider line ("---"), as in Markdown.
  if (text.trim() !== "" && isTableDivider(texts[i + 1] ?? "")) {
    const divider = i + 1;
    const endsTable = (line: string) =>
      line.trim() === "" || startsBlock(line) || DIVIDER_LINE_RE.test(line.trimStart());
    return firstLineAfter(texts, divider, endsTable) - 1;
  }
  return -1;
}

/** For each line, true when it is in a block (frontmatter, code, comment, table): it never moves. */
function blockLines(texts: string[]): boolean[] {
  const inBlock = texts.map(() => false);
  for (let i = 0; i < texts.length; i++) {
    const end = blockEnd(texts, i);
    if (end === -1) continue;
    for (let j = i; j <= end; j++) inBlock[j] = true;
    i = end;
  }
  return inBlock;
}

// A footnote definition ("[^1]: …") or a link reference definition ("[a]: …").
const DEFINITION_RE = /^\[[^\]]+\]:/;

/**
 * Headings, table rows, quotes, callouts, footnote definitions, link reference definitions and
 * lines that start with an HTML comment never move, even when they hold a link.
 */
function isFixedLine(text: string): boolean {
  const line = text.trimStart();
  // A line that starts with an HTML comment ends a table or a heading above it (startsBlock),
  // so it stays too: a link moved into its place would not end them.
  return HEADING_OR_QUOTE_RE.test(line) || line.startsWith("|") || DEFINITION_RE.test(line) ||
    line.startsWith("<!--");
}

// The start of a list item: leading white space (the same characters trimStart() skips, so the
// same lines count as list items as in startsBlock), the list marker and the spaces after it.
// It stays in its place; only the rest of the line (task box and link included) moves.
const LIST_START_RE = new RegExp(String.raw`^\s*` + LIST_MARKER);

// The start of a plain line: its leading spaces and tabs. It stays in its place too, so a line
// inside a list item stays inside it and a line at the left edge never becomes a code block.
// Only spaces and tabs: other white space at the start is rare and moves with the text.
const PLAIN_START_RE = /^[ \t]*/;

interface SortResult {
  content: string;
  /** How many link lines the note has (lines that can move). */
  links: number;
  /** True when the sorted note differs from the old one. */
  changed: boolean;
}

/** Link lines of one kind (list items or plain lines) and the places they were in. */
interface LinkGroup {
  /** Each place: its line number and the start that stays there (LIST_START_RE, PLAIN_START_RE). */
  places: { line: number; start: string }[];
  /** The part of each link line that moves (the rest after its start), and its sort key. */
  moving: { text: string; key: string }[];
}

/**
 * Sorts the link lines of a note by their sort key. All other lines keep their exact places.
 * List-item link lines (also tasks) fill the places where list-item link lines were; plain link
 * lines fill the places of plain link lines. So a plain line never lands above a "---" (where it
 * would become an underlined heading) or right under a table (where it would become a row).
 * Each place keeps its own start: a list-item place its spaces and list marker, so numbers,
 * bullets and nesting stay; a plain place its leading spaces and tabs, so indents stay. Only the
 * rest of the line moves. Each place keeps its own line ending.
 */
export function sortLinkLines(content: string): SortResult {
  // An invisible byte order mark at the very start stays there: it is not part of line 1.
  const bom = content.startsWith("\uFEFF") ? "\uFEFF" : "";
  const lines = content.slice(bom.length).split("\n");
  const endings = lines.map((line) => (line.endsWith("\r") ? "\r" : ""));
  const texts = lines.map((line, i) => line.slice(0, line.length - endings[i].length));
  const inBlock = blockLines(texts);
  const inHeading = underlinedHeadingLines(texts, inBlock);

  const listItems: LinkGroup = { places: [], moving: [] };
  const plainLines: LinkGroup = { places: [], moving: [] };
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    if (inBlock[i] || isFixedLine(text) || inHeading[i]) {
      continue;
    }
    const listStart = LIST_START_RE.exec(text)?.[0];
    const start = listStart ?? PLAIN_START_RE.exec(text)![0];
    const rest = text.slice(start.length);
    const key = sortKey(rest);
    // A key can be "" (for example "[[#]]"), so check for null, not for "truthy".
    if (key !== null) {
      // The kind comes from the list marker, not from the start: an indented plain line has a
      // start too.
      const group = listStart !== undefined ? listItems : plainLines;
      group.places.push({ line: i, start });
      group.moving.push({ text: rest, key });
    }
  }

  for (const { places, moving } of [listItems, plainLines]) {
    // Array sort is stable: lines with the same key keep their old order.
    moving.sort((a, b) => compareKeys(a.key, b.key));
    places.forEach(({ line, start }, n) => {
      lines[line] = start + moving[n].text + endings[line];
    });
  }
  const newContent = bom + lines.join("\n");
  const links = listItems.places.length + plainLines.places.length;
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
