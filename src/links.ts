// Pure link logic: no Obsidian imports, so it can be tested with `deno test`.

const LINK_PLACEHOLDER = "{link}";
export const DEFAULT_LINE_FORMAT = "- {link}";

// A web address runs from http(s):// to the next space, quote or bracket.
// One level of round brackets inside it is kept, so ".../wiki/Foo_(bar)" stays whole,
// while the closing bracket of "[title](https://…)" or "(see https://…)" is left out.
const URL_RE = /https?:\/\/(?:[^\s<>()\[\]"'`]|\([^\s<>()\[\]"'`]*\))+/gi;

// Punctuation stuck to the end of a link in a sentence.
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

/**
 * Makes "https://www.Site.com/page/" and "http://site.com/page" the same string.
 * Path, query and anchor keep their capital letters; a non-default port is kept.
 */
export function normalizeUrl(url: string): string {
  const cleaned = url.trim().replace(TRAILING_PUNCTUATION, "");
  try {
    const parsed = new URL(cleaned);
    // `host` keeps a non-default port (`hostname` would drop it); default ports are already gone.
    const host = parsed.host.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "");
    return host + path + parsed.search + parsed.hash;
  } catch {
    return cleaned.toLowerCase().replace(/\/+$/, "");
  }
}

/** True when the whole text is one web address (no spaces). */
export function isUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

/** True when `link` already appears anywhere in `content`. */
export function containsLink(content: string, link: string): boolean {
  const trimmed = link.trim();
  if (isUrl(trimmed)) {
    const target = normalizeUrl(trimmed);
    const found = content.match(URL_RE) ?? [];
    return found.some((url) => normalizeUrl(url) === target);
  }
  // Wiki links ([[Note]]) or any other text: plain match, ignoring capital letters.
  return content.toLowerCase().includes(trimmed.toLowerCase());
}

/** Builds the new line. A format without {link} falls back to the default, so the link is never lost. */
export function formatLine(format: string, link: string): string {
  const template = format.includes(LINK_PLACEHOLDER) ? format : DEFAULT_LINE_FORMAT;
  // split/join instead of replace: a "$" in the link must not be read as a replace pattern.
  return template.split(LINK_PLACEHOLDER).join(link);
}

/** Adds `line` on its own line at the very end of `content`, ending with a line break. */
export function appendLine(content: string, line: string): string {
  const separator = content.length === 0 || content.endsWith("\n") ? "" : "\n";
  return content + separator + line + "\n";
}

interface AddResult {
  content: string;
  added: boolean;
}

/** The whole add step: a duplicate leaves the content untouched, a new link is appended. */
export function addLinkToContent(content: string, link: string, format: string): AddResult {
  if (containsLink(content, link)) {
    return { content, added: false };
  }
  return { content: appendLine(content, formatLine(format, link)), added: true };
}

/** Only Markdown notes take new lines; text appended to a canvas, PDF or image breaks the file. */
export function isMarkdownNote(extension: string): boolean {
  return extension === "md";
}

/** Adds ".md" when the target note path has no such ending. */
export function withMarkdownExtension(path: string): string {
  return path.toLowerCase().endsWith(".md") ? path : path + ".md";
}
