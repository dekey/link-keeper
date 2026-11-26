import { assertEquals, assertThrows } from "@std/assert";
import { compareKeys, lineChanges, linkLine, sortLinkLines } from "../src/sort.ts";

// --- Sort key of a link line (SPEC.md "Sorting links", rule 3) ---

Deno.test("web link key is the last part of the address, without the query", () => {
  assertEquals(linkLine("- https://a.com/docs/page?id=2")?.key, "page");
});

Deno.test("web link key ends before the anchor", () => {
  assertEquals(linkLine("- https://a.com/page#intro")?.key, "page");
});

Deno.test("web link key ignores a trailing slash", () => {
  assertEquals(linkLine("- https://a.com/docs/")?.key, "docs");
});

Deno.test("web link key ignores several trailing slashes", () => {
  assertEquals(linkLine("- https://a.com/docs//")?.key, "docs");
});

Deno.test("web link key ignores a full stop stuck to the end of the link", () => {
  assertEquals(linkLine("- https://a.com/docs/.")?.key, "docs");
});

// The query and the anchor are cut first, so punctuation and slashes in front of them go too.
Deno.test("web link key drops the punctuation and slashes in front of the query or the anchor", () => {
  assertEquals(linkLine("- https://a.com/docs.?x=1")?.key, "docs");
  assertEquals(linkLine("- https://a.com/docs/.#top")?.key, "docs");
  assertEquals(linkLine("- https://a.com/docs./")?.key, "docs");
});

Deno.test("web link with no path is sorted by its domain", () => {
  assertEquals(linkLine("- https://a.com")?.key, "a.com");
});

Deno.test("web link with no path keeps www in its key", () => {
  assertEquals(linkLine("- https://www.a.com/")?.key, "www.a.com");
});

Deno.test("web link key keeps round brackets that are part of the address", () => {
  assertEquals(
    linkLine("- https://en.wikipedia.org/wiki/Mercury_(planet)")?.key,
    "Mercury_(planet)",
  );
});

Deno.test("web link key turns percent codes back into letters", () => {
  assertEquals(
    linkLine("- https://ru.wikipedia.org/wiki/%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0")?.key,
    "Москва",
  );
});

// The steps run in a fixed order: the anchor and the query are cut before the last part is
// taken, so a "/" in them does not change the key.
Deno.test("a / in the anchor does not change the key: the anchor is cut first", () => {
  assertEquals(linkLine("- https://app.com/#/settings")?.key, "app.com");
});

Deno.test("a / in the query does not change the key: the query is cut first", () => {
  assertEquals(linkLine("- https://a.com/page?next=/home")?.key, "page");
});

Deno.test("broken percent code keeps the key text as it is", () => {
  assertEquals(linkLine("- https://a.com/100%")?.key, "100%");
});

// linkLine reads the line with a pattern built from URL_RE and its flags. If URL_RE got the `g`
// flag, the second call would start after the first (longer) line and miss the link.
Deno.test("each line is read on its own: a long link line before does not hide the next link", () => {
  assertEquals(linkLine("- https://a.com/very/long/path/to/zeta")?.key, "zeta");
  assertEquals(linkLine("- https://b.com/alpha")?.key, "alpha");
});

// --- Lines with no link ---

Deno.test("heading text with no link is not a link line", () => {
  assertEquals(linkLine("# Reading list"), null);
});

Deno.test("plain text with no link is not a link line", () => {
  assertEquals(linkLine("Some text about a.com and docs"), null);
});

Deno.test("empty line is not a link line", () => {
  assertEquals(linkLine(""), null);
});

// --- Order of keys ---

Deno.test("keys go punctuation, digits by value, Latin letters, then other scripts", () => {
  const keys = [
    "Zeta2",
    "éclair",
    "www.a.com",
    "Москва",
    "2-tips",
    "alpha",
    "%d0",
    "10-tips",
    "a.com",
    "zeta",
    "-intro",
    "Alpha",
    "0abc",
    "eclair",
    "2-intro",
  ];
  assertEquals([...keys].sort(compareKeys), [
    "-intro",
    "%d0",
    "0abc",
    "2-intro",
    "2-tips",
    "10-tips",
    "a.com",
    "alpha",
    "Alpha",
    "éclair",
    "eclair",
    "www.a.com",
    "zeta",
    "Zeta2",
    "Москва",
  ]);
});

Deno.test("keys that differ only in capital letters or accents are equal", () => {
  assertEquals(compareKeys("alpha", "Alpha"), 0);
  assertEquals(compareKeys("éclair", "eclair"), 0);
});

// --- Sorting the blocks of link lines of a note ---

/** Joins lines with "\n", so a test shows the note line by line. */
function note(...lines: string[]): string {
  return lines.join("\n");
}

Deno.test("each block of link lines is sorted on its own while other lines keep their places", () => {
  // The SPEC "Sorting links" example: two blocks split by a text line.
  const before = note(
    "# Reading",
    "- https://b.com/zeta",
    "- https://a.com/2-intro",
    "Some text",
    "1. https://github.com/dekey/link-keeper",
    "2. [ ] https://github.com/dekey/link-keeper/pull/2",
    "",
  );
  const after = note(
    "# Reading",
    "- https://a.com/2-intro",
    "- https://b.com/zeta",
    "Some text",
    "1. [ ] https://github.com/dekey/link-keeper/pull/2",
    "2. https://github.com/dekey/link-keeper",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 4, changed: true });
});

// --- Rule 1: a link line is one web link, with only spaces, a list marker and a task box
// before it ---

Deno.test("only a line with one web link and nothing else but a list marker and a task box before it is sorted", () => {
  // Each line goes over a line of the same shape whose link sorts first ("…/0"). A link line
  // moves down below it; any other line is not sorted, so the note stays as it is.
  const rows: [line: string, first: string, isLinkLine: boolean][] = [
    ["https://github.com/dekey/link-keeper", "https://a.com/0", true],
    ["- https://github.com/dekey/link-keeper/pull/2", "- https://a.com/0", true],
    ["12. https://a.com/x", "12. https://a.com/0", true],
    ["+ https://a.com/x", "+ https://a.com/0", true],
    ["\t- [ ]  https://a.com/x", "\t- [ ]  https://a.com/0", true],
    ["- [X] https://a.com/x", "- [X] https://a.com/0", true],
    ["-   https://a.com/x", "-   https://a.com/0", true],
    ["-\thttps://a.com/x", "-\thttps://a.com/0", true],
    ["HTTPS://A.COM/x", "HTTPS://A.COM/0", true],
    ["- https://a.com/x \t", "- https://a.com/0 \t", true],
    ["-https://a.com/x", "-https://a.com/0", false],
    ["*https://a.com/x*", "*https://a.com/0*", false],
    ["- [ ]https://a.com/x", "- [ ]https://a.com/0", false],
    ["See https://a.com/x", "See https://a.com/0", false],
    ["- https://a.com/x nice", "- https://a.com/0 nice", false],
    ["- https://a.com/x https://b.com/y", "- https://a.com/0 https://b.com/0", false],
    ["- [title](https://a.com/x)", "- [title](https://a.com/0)", false],
    ["- [[Note]]", "- [[0]]", false],
    ["> https://a.com/x", "> https://a.com/0", false],
    ["# https://a.com/x", "# https://a.com/0", false],
    ["- 2. https://a.com/x", "- 2. https://a.com/0", false],
    ["[ ] https://a.com/x", "[ ] https://a.com/0", false],
    ["- [-] https://a.com/x", "- [-] https://a.com/0", false],
    ["- <https://a.com/x>", "- <https://a.com/0>", false],
  ];
  for (const [line, first, isLinkLine] of rows) {
    const before = note(line, first, "");
    const expected = isLinkLine
      ? { content: note(first, line, ""), links: 2, changed: true }
      : { content: before, links: 0, changed: false };
    assertEquals(sortLinkLines(before), expected, JSON.stringify(line));
  }
});

// --- Rule 2: a block is link lines right under each other ---

Deno.test("a blank line, a text line, a heading and a line with a link and text each end a block", () => {
  for (const line of ["", "Some text", "## More", "- https://c.com/aaa read later"]) {
    const before = note(
      "- https://b.com/zeta",
      "- https://b.com/beta",
      line,
      "- https://a.com/mid",
      "- https://a.com/alpha",
      "",
    );
    const after = note(
      "- https://b.com/beta",
      "- https://b.com/zeta",
      line,
      "- https://a.com/alpha",
      "- https://a.com/mid",
      "",
    );
    assertEquals(sortLinkLines(before), { content: after, links: 4, changed: true }, line);
  }
});

Deno.test("two blocks in one note are sorted each on their own: no link moves to the other block", () => {
  const before = note(
    "## Top",
    "1. https://b.com/zeta",
    "2. https://a.com/alpha",
    "3. https://c.com/mid",
    "",
    "## More",
    "- https://d.com/beta",
    "- https://d.com/aaa",
    "",
  );
  const after = note(
    "## Top",
    "1. https://a.com/alpha",
    "2. https://c.com/mid",
    "3. https://b.com/zeta",
    "",
    "## More",
    "- https://d.com/aaa",
    "- https://d.com/beta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 5, changed: true });
});

Deno.test("a block ends where the list marker comes or goes, so no task box lands on a line without a marker", () => {
  const before = note(
    "https://a.com/zeta",
    "- [x] https://a.com/beta",
    "- [ ] https://a.com/alpha",
    "",
  );
  const after = note(
    "https://a.com/zeta",
    "- [ ] https://a.com/alpha",
    "- [x] https://a.com/beta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 3, changed: true });

  const listThenPlain = note("- https://a.com/zeta", "https://a.com/alpha", "");
  assertEquals(sortLinkLines(listThenPlain), { content: listThenPlain, links: 2, changed: false });
});

// The PR #2 review case: the old sort turned a link line here into a heading.
Deno.test("a line with two list markers over an indented --- is not a link line, so the note keeps its structure", () => {
  const text = note("- 2. https://x.com/zeta", "    ---", "- [ ] https://x.com/alpha", "");
  assertEquals(sortLinkLines(text), { content: text, links: 1, changed: false });
});

// --- Rule 3: order inside a block ---

Deno.test("the key is the last part of the link, so …/pull/2 sorts before …/link-keeper", () => {
  const before = note(
    "- https://github.com/dekey/link-keeper",
    "- https://github.com/dekey/link-keeper/pull/2",
    "",
  );
  const after = note(
    "- https://github.com/dekey/link-keeper/pull/2",
    "- https://github.com/dekey/link-keeper",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("numbers in keys are compared by value: 2 comes before 10", () => {
  const result = sortLinkLines(note("- https://x.com/10-tips", "- https://x.com/2-tips", ""));
  assertEquals(result, {
    content: note("- https://x.com/2-tips", "- https://x.com/10-tips", ""),
    links: 2,
    changed: true,
  });
});

Deno.test("links with the same key keep their old order", () => {
  const before = note("- https://b.com/x", "- https://a.com/x", "");
  assertEquals(sortLinkLines(before), { content: before, links: 2, changed: false });
});

// --- Rule 4: each place keeps its start (indent and list marker); the rest moves ---

Deno.test("a numbered list keeps its numbers 1, 2, 3 in order, only the links move", () => {
  const before = note(
    "# Reading list",
    "",
    "1. https://x.com/zen",
    "2. https://x.com/atomic-habits",
    "3. https://x.com/deep-work",
    "",
  );
  const after = note(
    "# Reading list",
    "",
    "1. https://x.com/atomic-habits",
    "2. https://x.com/deep-work",
    "3. https://x.com/zen",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 3, changed: true });
});

// The child lines are in the same block as their parents, so their links mix (a known limit),
// but each place keeps its indent, so the shape of the list stays.
Deno.test("each place keeps its indent, list marker and the spaces after it, also in a nested list", () => {
  const before = note(
    "1) https://x.com/projects",
    "\t*   https://x.com/zeta-plan",
    "\t* https://x.com/alpha-plan",
    "2) https://x.com/inbox",
    "",
  );
  const after = note(
    "1) https://x.com/alpha-plan",
    "\t*   https://x.com/inbox",
    "\t* https://x.com/projects",
    "2) https://x.com/zeta-plan",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 4, changed: true });
});

Deno.test("a task box moves with its link, also into a place without a box", () => {
  const before = note(
    "- https://x.com/zeta",
    "- [x] https://x.com/alpha",
    "- [ ] https://x.com/mid",
    "",
  );
  const after = note(
    "- [x] https://x.com/alpha",
    "- [ ] https://x.com/mid",
    "- https://x.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 3, changed: true });
});

// Two spaces at a line end are a line break in Markdown: they must not move to another line.
Deno.test("spaces and tabs at the line end stay in their place, so a line break does not move and a sorted note is not rewritten", () => {
  const before = note("https://z.com/zeta  ", "https://a.com/alpha  ", "https://m.com/mid", "");
  assertEquals(sortLinkLines(before), {
    content: note("https://a.com/alpha  ", "https://m.com/mid  ", "https://z.com/zeta", ""),
    links: 3,
    changed: true,
  });
  const sorted = note("- https://x.com/alpha\t", "- https://x.com/zeta  ", "");
  assertEquals(sortLinkLines(sorted), { content: sorted, links: 2, changed: false });
});

Deno.test("each place keeps its own line ending in a Windows note without a final line break", () => {
  assertEquals(sortLinkLines("# R\r\n- https://x.com/zeta\r\n- https://x.com/alpha"), {
    content: "# R\r\n- https://x.com/alpha\r\n- https://x.com/zeta",
    links: 2,
    changed: true,
  });
});

Deno.test("a byte order mark stays at the start of the note when the first link line moves", () => {
  assertEquals(sortLinkLines("\uFEFF- https://x.com/zeta\n- https://x.com/alpha\n"), {
    content: "\uFEFF- https://x.com/alpha\n- https://x.com/zeta\n",
    links: 2,
    changed: true,
  });
});

// --- Rule 5: the frontmatter and fenced code blocks are never touched ---

/**
 * Checks that the sort does not touch `part` (frontmatter or a code block) and sorts the block
 * right under it. `part` holds the out-of-order link lines "- https://x.com/zeta" and
 * "- https://x.com/alpha": if the part is not skipped, they get sorted; if the part does not
 * end where it should, it takes in the block under it, and that block is not sorted. Both give
 * another note text.
 */
function assertPartStays(...part: string[]): void {
  const before = note(...part, "- https://y.com/beta", "- https://y.com/alpha", "");
  const after = note(...part, "- https://y.com/alpha", "- https://y.com/beta", "");
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
}

Deno.test("frontmatter stays as it is, also a YAML list of links in it, and the block below it is sorted", () => {
  assertPartStays(
    "---",
    "links:",
    "  - https://x.com/zeta",
    "  - https://x.com/alpha",
    "---",
  );
});

Deno.test("frontmatter stays as it is in a note with Windows line breaks", () => {
  const frontmatter = ["---", "links:", "- https://x.com/zeta", "- https://x.com/alpha", "---"];
  const before = [...frontmatter, "- https://y.com/beta", "- https://y.com/alpha", ""];
  const after = [...frontmatter, "- https://y.com/alpha", "- https://y.com/beta", ""];
  assertEquals(sortLinkLines(before.join("\r\n")), {
    content: after.join("\r\n"),
    links: 2,
    changed: true,
  });
});

Deno.test("a line of three dots does not end frontmatter: only a --- line does, as in Obsidian", () => {
  assertPartStays(
    "---",
    "title: Reading",
    "...",
    "- https://x.com/zeta",
    "- https://x.com/alpha",
    "---",
  );
});

Deno.test("a --- line with a space after it does not end frontmatter: only an exact --- line does", () => {
  assertPartStays(
    "---",
    "title: Reading",
    "--- ",
    "- https://x.com/zeta",
    "- https://x.com/alpha",
    "---",
  );
});

Deno.test("a ``` line inside frontmatter does not open a code block", () => {
  assertPartStays(
    "---",
    "note: |",
    "  ```",
    "  - https://x.com/zeta",
    "  - https://x.com/alpha",
    "---",
  );
});

Deno.test("a --- at the top with no closing --- is a divider, so the links below it get sorted", () => {
  assertEquals(
    sortLinkLines(
      note("---", "title: Reading", "- https://x.com/zeta", "- https://x.com/alpha", ""),
    ),
    {
      content: note("---", "title: Reading", "- https://x.com/alpha", "- https://x.com/zeta", ""),
      links: 2,
      changed: true,
    },
  );
});

Deno.test("frontmatter after an invisible byte order mark stays as it is", () => {
  assertPartStays(
    "\uFEFF---",
    "links:",
    "- https://x.com/zeta",
    "- https://x.com/alpha",
    "---",
  );
});

Deno.test("a --- line below the top is a divider, not frontmatter", () => {
  const before = note(
    "# Links",
    "---",
    "- https://x.com/zeta",
    "- https://x.com/alpha",
    "---",
    "",
  );
  const after = note(
    "# Links",
    "---",
    "- https://x.com/alpha",
    "- https://x.com/zeta",
    "---",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

// Lines inside a code block are not link lines, so the link lines above and below it are two
// blocks: no link moves across the code block.
Deno.test("a code block between two link lines ends the block, so no link moves across it", () => {
  for (const fence of ["```", "~~~"]) {
    const before = note("- https://a.com/zeta", fence, "code", fence, "- https://a.com/alpha", "");
    assertEquals(sortLinkLines(before), { content: before, links: 2, changed: false }, fence);
  }
});

Deno.test("a ``` code block is not closed by ~~~ and its links stay in place", () => {
  assertPartStays("```text", "~~~", "- https://x.com/zeta", "- https://x.com/alpha", "```");
});

Deno.test("a ~~~ code block ends at its closing ~~~ line", () => {
  assertPartStays("~~~", "- https://x.com/zeta", "- https://x.com/alpha", "~~~");
});

Deno.test("a ```` code block is not closed by a shorter ``` line and its links stay in place", () => {
  assertPartStays(
    "````md",
    "```",
    "- https://x.com/zeta",
    "- https://x.com/alpha",
    "```",
    "````",
  );
});

Deno.test("a code block ends at a closing fence line longer than its opening one", () => {
  assertPartStays("```", "- https://x.com/zeta", "- https://x.com/alpha", "````");
});

Deno.test("spaces and tabs after the closing fence still close the code block", () => {
  assertPartStays("```", "- https://x.com/zeta", "- https://x.com/alpha", "``` \t");
});

Deno.test("a tab before a fence still opens or closes the code block", () => {
  assertPartStays("\t```", "- https://x.com/zeta", "- https://x.com/alpha", "```");
  assertPartStays("```", "- https://x.com/zeta", "- https://x.com/alpha", "\t```");
});

// Rule 5 says "spaces or tabs": other blank-looking characters do not count.
Deno.test("a no-break space next to a fence is not a space, so it does not open or close a code block", () => {
  const before = note("\u00A0```", "- https://x.com/zeta", "- https://x.com/alpha", "");
  const after = note("\u00A0```", "- https://x.com/alpha", "- https://x.com/zeta", "");
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
  assertPartStays("```", "- https://x.com/zeta", "- https://x.com/alpha", "```\u00A0", "```");
});

Deno.test("two backticks or two tildes do not open a code block, so the links below them are sorted", () => {
  for (const line of ["``", "~~"]) {
    const before = note(line, "- https://x.com/zeta", "- https://x.com/alpha", "");
    const after = note(line, "- https://x.com/alpha", "- https://x.com/zeta", "");
    assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true }, line);
  }
});

// Only a backtick fence must have no backtick after it; a ~~~ fence may have a ~ after it.
Deno.test("a ~~~ fence with a ~ in the text after it opens a code block", () => {
  assertPartStays("~~~ a~b", "- https://x.com/zeta", "- https://x.com/alpha", "~~~");
});

Deno.test("a fence with text after it (```js) opens a code block", () => {
  assertPartStays("```js", "- https://x.com/zeta", "- https://x.com/alpha", "```");
});

Deno.test("a fence line with text after it does not close the code block", () => {
  assertPartStays("```", "```js", "- https://x.com/zeta", "- https://x.com/alpha", "```");
});

Deno.test("a code block indented inside a list item stays in place", () => {
  assertPartStays(
    "- item",
    "  ```",
    "  - https://x.com/zeta",
    "  - https://x.com/alpha",
    "  ```",
  );
});

Deno.test("a code block that starts on a list item line stays in place", () => {
  for (const opener of ["- ```", "* ```", "+ ```"]) {
    assertPartStays(opener, "  - https://x.com/zeta", "  - https://x.com/alpha", "  ```");
  }
  assertPartStays("1. ```", "   - https://x.com/zeta", "   - https://x.com/alpha", "   ```");
});

Deno.test("a code block opened after two list markers stays in place", () => {
  for (const opener of ["- 1. ```", "- - ```", "1. - ```"]) {
    assertPartStays(opener, "     - https://x.com/zeta", "     - https://x.com/alpha", "     ```");
  }
});

Deno.test("a line that starts with ``` and has more backticks is inline code, not a code block", () => {
  const before = note("```a``` text", "- https://x.com/zeta", "- https://x.com/alpha", "");
  const after = note("```a``` text", "- https://x.com/alpha", "- https://x.com/zeta", "");
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("a code block that is never closed runs to the end of the note", () => {
  const before = note(
    "- https://y.com/beta",
    "- https://y.com/alpha",
    "~~~py",
    "- https://x.com/zeta",
    "- https://x.com/alpha",
    "",
  );
  const after = note(
    "- https://y.com/alpha",
    "- https://y.com/beta",
    "~~~py",
    "- https://x.com/zeta",
    "- https://x.com/alpha",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

// --- Rule 6: the count in the pop-up ---

Deno.test("the link count holds every link line: also blocks of one line and lines that did not move", () => {
  const rest = [
    "",
    "https://a.com/solo",
    "See https://a.com/text",
    "```",
    "- https://a.com/code",
    "```",
    "",
  ];
  const sorted = note("- https://a.com/alpha", "- https://a.com/beta", ...rest);
  assertEquals(sortLinkLines(sorted), { content: sorted, links: 3, changed: false });
  assertEquals(sortLinkLines(note("- https://a.com/beta", "- https://a.com/alpha", ...rest)), {
    content: sorted,
    links: 3,
    changed: true,
  });
});

// --- Small notes and sorting twice ---

Deno.test("a note without a final line break stays without one", () => {
  assertEquals(sortLinkLines("- https://x.com/zeta\n- https://x.com/alpha"), {
    content: "- https://x.com/alpha\n- https://x.com/zeta",
    links: 2,
    changed: true,
  });
});

Deno.test("an empty note is left as it is", () => {
  assertEquals(sortLinkLines(""), { content: "", links: 0, changed: false });
});

Deno.test("a note with one link is left as it is", () => {
  const before = note("# Reading", "- https://x.com/zeta", "");
  assertEquals(sortLinkLines(before), { content: before, links: 1, changed: false });
});

Deno.test("sorting a sorted note again changes nothing", () => {
  const first = sortLinkLines(note(
    "- https://b.com/x",
    "- https://z.com/alpha",
    "- https://a.com/x",
    "- https://c.com/10-tips",
    "- https://c.com/2-tips",
    "",
  ));
  assertEquals(
    first.content,
    note(
      "- https://c.com/2-tips",
      "- https://c.com/10-tips",
      "- https://z.com/alpha",
      "- https://b.com/x",
      "- https://a.com/x",
      "",
    ),
  );
  assertEquals(sortLinkLines(first.content), {
    content: first.content,
    links: 5,
    changed: false,
  });
});

// --- Editor changes for a sorted note ---

Deno.test("only the lines that changed become editor changes, each from its start to its old end", () => {
  assertEquals(
    lineChanges(
      note("# Reading", "- https://b.com/zeta", "text", "- https://a.com/alpha", ""),
      note("# Reading", "- https://a.com/alpha", "text", "- https://b.com/zeta", ""),
    ),
    [
      { from: { line: 1, ch: 0 }, to: { line: 1, ch: 20 }, text: "- https://a.com/alpha" },
      { from: { line: 3, ch: 0 }, to: { line: 3, ch: 21 }, text: "- https://b.com/zeta" },
    ],
  );
});

Deno.test("a Windows line ending is not part of an editor change, so each line keeps its own", () => {
  assertEquals(
    lineChanges(
      "- https://x.com/zeta\r\n- https://x.com/alpha",
      "- https://x.com/alpha\r\n- https://x.com/zeta",
    ),
    [
      { from: { line: 0, ch: 0 }, to: { line: 0, ch: 20 }, text: "- https://x.com/alpha" },
      { from: { line: 1, ch: 0 }, to: { line: 1, ch: 21 }, text: "- https://x.com/zeta" },
    ],
  );
});

Deno.test("a note with no changed line gives no editor changes", () => {
  const text = note("- https://a.com/alpha", "- https://b.com/zeta", "");
  assertEquals(lineChanges(text, text), []);
});

Deno.test("editor changes are refused when the line count differs, so no line is put in a wrong place", () => {
  assertThrows(() => lineChanges("a\nb", "a"), Error, "line count changed: 2 → 1");
});
