import { assertEquals, assertThrows } from "@std/assert";
import { URL_RE } from "../src/links.ts";
import { compareKeys, lineChanges, sortKey, sortLinkLines } from "../src/sort.ts";

// --- Sort key of a web link (SPEC.md "Sorting links", "Sort key") ---

Deno.test("web link key is the last part of the address, without the query", () => {
  assertEquals(sortKey("- https://a.com/docs/page?id=2"), "page");
});

Deno.test("web link key ends before the anchor", () => {
  assertEquals(sortKey("- https://a.com/page#intro"), "page");
});

Deno.test("web link key ignores a trailing slash", () => {
  assertEquals(sortKey("- https://a.com/docs/"), "docs");
});

Deno.test("web link key ignores several trailing slashes", () => {
  assertEquals(sortKey("- https://a.com/docs//"), "docs");
});

Deno.test("web link key ignores a full stop after the link in a sentence", () => {
  assertEquals(sortKey("see https://a.com/docs/."), "docs");
});

Deno.test("web link key ignores bold, italic and strike-through marks glued to a bare link", () => {
  const lines = {
    "- **https://a.com/zeta**": "zeta",
    "- _https://a.com/zeta_": "zeta",
    "- ~~https://a.com/zeta~~": "zeta",
    "- **https://a.com/zeta**.": "zeta",
    "- *https://a.com/docs/?id=2*": "docs",
  };
  for (const [line, key] of Object.entries(lines)) assertEquals(sortKey(line), key, line);
});

Deno.test("a bold bare link sorts by its address, as if it were not bold", () => {
  assertEquals(sortLinkLines(note("- **https://a.com/zeta**", "- https://a.com/zeta-2", "")), {
    content: note("- **https://a.com/zeta**", "- https://a.com/zeta-2", ""),
    links: 2,
    changed: false,
  });
  assertEquals(sortLinkLines(note("- https://a.com/zeta-2", "- **https://a.com/zeta**", "")), {
    content: note("- **https://a.com/zeta**", "- https://a.com/zeta-2", ""),
    links: 2,
    changed: true,
  });
});

Deno.test("web link with no path is sorted by its domain", () => {
  assertEquals(sortKey("- https://a.com"), "a.com");
});

Deno.test("web link with no path keeps www in its key", () => {
  assertEquals(sortKey("- https://www.a.com/"), "www.a.com");
});

Deno.test("Markdown link is sorted by its address, not by its title, and keeps capitals", () => {
  assertEquals(sortKey("- [Zebra](https://c.com/blog/Alpha)"), "Alpha");
});

Deno.test("a Markdown link with a web address in its title is sorted by the address it opens", () => {
  const lines = {
    "- [https://b.com/zeta](https://a.com/alpha)": "alpha",
    "- [see https://b.com/zeta here](https://a.com/alpha)": "alpha",
    "- [https://b.com/zeta](<https://a.com/alpha>)": "alpha",
    // No "(address)" after the brackets: not a Markdown link, so the address in them counts.
    "- [https://b.com/zeta]": "zeta",
  };
  for (const [line, key] of Object.entries(lines)) assertEquals(sortKey(line), key, line);
});

Deno.test("web link key keeps round brackets that are part of the address", () => {
  assertEquals(sortKey("- https://en.wikipedia.org/wiki/Mercury_(planet)"), "Mercury_(planet)");
});

Deno.test("web link key turns percent codes back into letters", () => {
  assertEquals(
    sortKey("- https://ru.wikipedia.org/wiki/%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0"),
    "Москва",
  );
});

// The steps run in a fixed order: the anchor and the query are cut before the last part is
// taken, so a "/" in them does not change the key.
Deno.test("a / in the anchor does not change the key: the anchor is cut first", () => {
  assertEquals(sortKey("- https://app.com/#/settings"), "app.com");
});

Deno.test("a / in the query does not change the key: the query is cut first", () => {
  assertEquals(sortKey("- https://a.com/page?next=/home"), "page");
});

// --- Sort key of a note link ---

Deno.test("note link key is the note name, without folder and alias", () => {
  assertEquals(sortKey("- [[Folder/My Note|alias]]"), "My Note");
});

Deno.test("note link to a heading is sorted by the note name", () => {
  assertEquals(sortKey("- [[Note#Heading]]"), "Note");
});

Deno.test("note link to a heading in the same note is sorted by the heading text", () => {
  assertEquals(sortKey("- [[#Heading]]"), "Heading");
});

Deno.test("a / in the alias does not change the key: the alias is cut first", () => {
  assertEquals(sortKey("- [[Folder/Note|a/b]]"), "Note");
});

Deno.test("a heading in the same note is sorted by its whole text, also when it holds a /", () => {
  assertEquals(sortKey("- [[#Q&A / Notes]]"), "Q&A / Notes");
});

// --- The first link in the line gives the key ---

Deno.test("web link before a note link in the same line gives the key", () => {
  assertEquals(sortKey("- https://a.com/x [[Other]]"), "x");
});

Deno.test("note link before a web link in the same line gives the key", () => {
  assertEquals(sortKey("- [[Other]] https://a.com/x"), "Other");
});

// --- Lines that are not link lines ---

Deno.test("heading text with no link is not a link line", () => {
  assertEquals(sortKey("# Reading list"), null);
});

Deno.test("plain text with no link is not a link line", () => {
  assertEquals(sortKey("Some text about a.com and docs"), null);
});

Deno.test("empty line is not a link line", () => {
  assertEquals(sortKey(""), null);
});

Deno.test("note link that is never closed with ]] is not a link line", () => {
  assertEquals(sortKey("- [[Unfinished note"), null);
});

// --- Edge cases ---

Deno.test("broken percent code keeps the key text as it is", () => {
  assertEquals(sortKey("- https://a.com/100%"), "100%");
});

// sortKey uses its own pattern without the `g` flag. If that pattern got the `g` flag, the second
// call would start after the first (longer) line and miss the link.
Deno.test("each line is read on its own: a long link line before does not hide the next link", () => {
  assertEquals(sortKey("- https://a.com/very/long/path/to/zeta"), "zeta");
  assertEquals(sortKey("- https://b.com/alpha"), "alpha");
});

// Other code may leave a position in the shared URL_RE (exec or test elsewhere). The sort key
// must not start its search there.
Deno.test("a position left in the shared link pattern does not hide the link of a line", () => {
  URL_RE.lastIndex = 10;
  try {
    assertEquals(sortKey("- https://b.com/alpha"), "alpha");
  } finally {
    URL_RE.lastIndex = 0;
  }
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

// --- Sorting the link lines of a note ---

/** Joins lines with "\n", so a test shows the note line by line. */
function note(...lines: string[]): string {
  return lines.join("\n");
}

Deno.test("link lines are sorted by key while other lines keep their places", () => {
  const before = note(
    "# Reading",
    "- https://b.com/zeta",
    "Some text",
    "- https://a.com/2-intro",
    "- [Alpha](https://c.com/docs/alpha/)",
    "",
  );
  const after = note(
    "# Reading",
    "- https://a.com/2-intro",
    "Some text",
    "- [Alpha](https://c.com/docs/alpha/)",
    "- https://b.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 3, changed: true });
});

Deno.test("links that start with a digit come before links that start with a letter", () => {
  const result = sortLinkLines(note("- https://x.com/alpha", "- https://x.com/2-intro", ""));
  assertEquals(result, {
    content: note("- https://x.com/2-intro", "- https://x.com/alpha", ""),
    links: 2,
    changed: true,
  });
});

Deno.test("numbers in keys are compared by value: 2 comes before 10", () => {
  const result = sortLinkLines(note("- https://x.com/10-tips", "- https://x.com/2-tips", ""));
  assertEquals(result, {
    content: note("- https://x.com/2-tips", "- https://x.com/10-tips", ""),
    links: 2,
    changed: true,
  });
});

Deno.test("capital letters do not change the order", () => {
  const result = sortLinkLines(note("- https://x.com/Zeta", "- https://x.com/alpha", ""));
  assertEquals(result, {
    content: note("- https://x.com/alpha", "- https://x.com/Zeta", ""),
    links: 2,
    changed: true,
  });
});

Deno.test("links with the same key keep their old order", () => {
  const before = note("- https://b.com/x", "- https://a.com/x", "");
  assertEquals(sortLinkLines(before), { content: before, links: 2, changed: false });
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

// --- A list place keeps its start: spaces, list marker and the spaces after it ---

Deno.test("a numbered list keeps its numbers 1, 2, 3 in order, only the links move", () => {
  const before = note(
    "# Reading list",
    "",
    "1. [[Zen and the Art]]",
    "2. [[Atomic Habits]]",
    "3. [[Deep Work]]",
    "",
  );
  const after = note(
    "# Reading list",
    "",
    "1. [[Atomic Habits]]",
    "2. [[Deep Work]]",
    "3. [[Zen and the Art]]",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 3, changed: true });
});

Deno.test("a numbered list right under a text line still starts with 1 after the sort", () => {
  const before = note(
    "Books to read:",
    "1. [[The Pragmatic Programmer]]",
    "2. [[Clean Code]]",
    "3. [[Atomic Habits]]",
    "",
  );
  const after = note(
    "Books to read:",
    "1. [[Atomic Habits]]",
    "2. [[Clean Code]]",
    "3. [[The Pragmatic Programmer]]",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 3, changed: true });
});

Deno.test("a numbered list stays numbered and a bullet list stays bulleted when links move between them", () => {
  const before = note(
    "## Top",
    "1. https://b.com/zeta",
    "2. https://a.com/alpha",
    "3. https://c.com/mid",
    "",
    "## More",
    "- https://d.com/beta",
    "",
  );
  const after = note(
    "## Top",
    "1. https://a.com/alpha",
    "2. https://d.com/beta",
    "3. https://c.com/mid",
    "",
    "## More",
    "- https://b.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 4, changed: true });
});

Deno.test("a nested list keeps its indents, markers and the spaces after them in place", () => {
  const before = note(
    "1) [[Projects]]",
    "\t*   [[Zeta plan]]",
    "\t* [[Alpha plan]]",
    "2) [[Inbox]]",
    "",
  );
  const after = note(
    "1) [[Alpha plan]]",
    "\t*   [[Inbox]]",
    "\t* [[Projects]]",
    "2) [[Zeta plan]]",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 4, changed: true });
});

Deno.test("note links and web links are sorted together", () => {
  const before = note("- [[Beta]]", "- https://x.com/zeta", "- [Read](https://x.com/alpha)", "");
  const after = note("- [Read](https://x.com/alpha)", "- [[Beta]]", "- https://x.com/zeta", "");
  assertEquals(sortLinkLines(before), { content: after, links: 3, changed: true });
});

Deno.test("a link with an empty key is still a link line and sorts first", () => {
  const result = sortLinkLines(note("- https://x.com/zeta", "- [[#]]", ""));
  assertEquals(result, {
    content: note("- [[#]]", "- https://x.com/zeta", ""),
    links: 2,
    changed: true,
  });
});

// --- Blocks and lines that never move ---
// Each test checks the full note text: the lines of the block (or the fixed line) keep their
// places and the link lines around them get sorted. So a block that is not found, or that does
// not end where it should (and swallows the rest of the note), makes the test fail.

Deno.test("frontmatter stays as it is, links below it are sorted", () => {
  const before = note(
    "---",
    "source: https://z.com/zeta",
    "tags: [reading]",
    "---",
    "- https://x.com/zeta",
    "- https://x.com/alpha",
    "",
  );
  const after = note(
    "---",
    "source: https://z.com/zeta",
    "tags: [reading]",
    "---",
    "- https://x.com/alpha",
    "- https://x.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("frontmatter stays as it is in a note with Windows line breaks", () => {
  const before = [
    "---",
    "source: https://z.com/zeta",
    "---",
    "- https://x.com/zeta",
    "- https://x.com/alpha",
    "",
  ].join("\r\n");
  const after = [
    "---",
    "source: https://z.com/zeta",
    "---",
    "- https://x.com/alpha",
    "- https://x.com/zeta",
    "",
  ].join("\r\n");
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("a line of three dots does not end frontmatter: only a --- line does, as in Obsidian", () => {
  const frontmatter = ["---", "source: https://z.com/zeta", "...", "- https://x.com/zeta", "---"];
  assertEquals(
    sortLinkLines(note(...frontmatter, "- https://x.com/beta", "- https://x.com/alpha", "")),
    {
      content: note(...frontmatter, "- https://x.com/alpha", "- https://x.com/beta", ""),
      links: 2,
      changed: true,
    },
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
  const before = note(
    "\uFEFF---",
    "source: https://z.com/zeta",
    "---",
    "- https://x.com/zeta",
    "- https://x.com/alpha",
    "",
  );
  const after = note(
    "\uFEFF---",
    "source: https://z.com/zeta",
    "---",
    "- https://x.com/alpha",
    "- https://x.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("a byte order mark stays at the start of the note when the first link line moves", () => {
  assertEquals(sortLinkLines("\uFEFF- https://x.com/zeta\n- https://x.com/alpha\n"), {
    content: "\uFEFF- https://x.com/alpha\n- https://x.com/zeta\n",
    links: 2,
    changed: true,
  });
});

Deno.test("a --- line below the top is a divider, not frontmatter", () => {
  const before = note(
    "# Links",
    "---",
    "- https://x.com/zeta",
    "---",
    "- https://x.com/alpha",
    "",
  );
  const after = note(
    "# Links",
    "---",
    "- https://x.com/alpha",
    "---",
    "- https://x.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

// The four code block tests below start the note with the block, with links only below it.
// assertBlockStays (further down) always puts a link above the block, so it does not cover a
// block on the first line; these tests write the note out in full instead.
Deno.test("a ``` code block is not closed by ~~~ and its link stays in place", () => {
  const before = note(
    "```text",
    "~~~",
    "- https://x.com/beta",
    "```",
    "- https://x.com/zeta",
    "- https://x.com/alpha",
    "",
  );
  const after = note(
    "```text",
    "~~~",
    "- https://x.com/beta",
    "```",
    "- https://x.com/alpha",
    "- https://x.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("a ```` code block is not closed by a shorter ``` line and its link stays in place", () => {
  const before = note(
    "````md",
    "```",
    "- https://x.com/beta",
    "```",
    "````",
    "- https://x.com/zeta",
    "- https://x.com/alpha",
    "",
  );
  const after = note(
    "````md",
    "```",
    "- https://x.com/beta",
    "```",
    "````",
    "- https://x.com/alpha",
    "- https://x.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("a fence line with text after it does not close the code block", () => {
  const before = note(
    "```",
    "- https://x.com/beta",
    "```js",
    "- https://x.com/gamma",
    "```",
    "- https://x.com/zeta",
    "- https://x.com/alpha",
    "",
  );
  const after = note(
    "```",
    "- https://x.com/beta",
    "```js",
    "- https://x.com/gamma",
    "```",
    "- https://x.com/alpha",
    "- https://x.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("an indented code block inside a list item stays in place", () => {
  const before = note(
    "- item",
    "  ```",
    "  - https://x.com/beta",
    "  ```",
    "- https://x.com/zeta",
    "- https://x.com/alpha",
    "",
  );
  const after = note(
    "- item",
    "  ```",
    "  - https://x.com/beta",
    "  ```",
    "- https://x.com/alpha",
    "- https://x.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("a code block that is never closed runs to the end of the note", () => {
  const before = note(
    "- https://x.com/zeta",
    "- https://x.com/beta",
    "~~~py",
    "- https://x.com/alpha",
    "",
  );
  const after = note(
    "- https://x.com/beta",
    "- https://x.com/zeta",
    "~~~py",
    "- https://x.com/alpha",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("headings, table rows and quotes with links stay in place", () => {
  const before = note(
    "## [[Project X]]",
    "- https://x.com/zeta",
    "| [[A]] | b |",
    "- https://x.com/beta",
    "> see https://a.com/zeta",
    "- https://x.com/alpha",
    "",
  );
  const after = note(
    "## [[Project X]]",
    "- https://x.com/alpha",
    "| [[A]] | b |",
    "- https://x.com/beta",
    "> see https://a.com/zeta",
    "- https://x.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 3, changed: true });
});

Deno.test("footnote definitions with links stay in place while the other plain link lines are sorted", () => {
  const footnotes = ["", "[^1]: https://a.com/alpha", "[^2]: https://b.com/beta", ""];
  const onlyOneOther = note(
    "# Article notes",
    "Main claim.[^1] Second claim.[^2]",
    "Video: https://youtube.com/watch?v=x",
    ...footnotes,
  );
  assertEquals(sortLinkLines(onlyOneOther), { content: onlyOneOther, links: 1, changed: false });

  const before = note(
    "# Article notes",
    "Main claim.[^1] Second claim.[^2]",
    "Video: https://youtube.com/watch?v=x",
    "Slides: https://slides.com/deck",
    ...footnotes,
  );
  const after = note(
    "# Article notes",
    "Main claim.[^1] Second claim.[^2]",
    "Slides: https://slides.com/deck",
    "Video: https://youtube.com/watch?v=x",
    ...footnotes,
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("link reference definitions ([a]: address) stay in place while the other plain link lines are sorted", () => {
  const before = note(
    "Read the [guide][g] and the [docs][d] first.",
    "https://z.com/zeta",
    "https://a.com/alpha",
    "",
    "[g]: https://b.com/beta",
    "  [d]: https://c.com/aaa",
    "",
  );
  const after = note(
    "Read the [guide][g] and the [docs][d] first.",
    "https://a.com/alpha",
    "https://z.com/zeta",
    "",
    "[g]: https://b.com/beta",
    "  [d]: https://c.com/aaa",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("an indented callout with a link stays in place", () => {
  const before = note(
    "- https://x.com/zeta",
    "  > [!note] https://x.com/aaa",
    "- https://x.com/alpha",
    "",
  );
  const after = note(
    "- https://x.com/alpha",
    "  > [!note] https://x.com/aaa",
    "- https://x.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("an underlined heading (a text line with === or --- under it) with a link stays in place", () => {
  for (const underline of ["===", "---"]) {
    const before = note(
      "- https://x.com/zeta",
      "",
      "[[Aaa]]",
      underline,
      "- https://x.com/alpha",
      "",
    );
    const after = note(
      "- https://x.com/alpha",
      "",
      "[[Aaa]]",
      underline,
      "- https://x.com/zeta",
      "",
    );
    assertEquals(
      sortLinkLines(before),
      { content: after, links: 2, changed: true },
      `underline ${underline}`,
    );
  }
});

Deno.test("every text line of an underlined heading written over two lines stays in place", () => {
  const before = note(
    "- https://x.com/zeta",
    "",
    "https://x.com/aaa",
    "https://x.com/aab",
    "---",
    "- https://x.com/alpha",
    "",
  );
  const after = note(
    "- https://x.com/alpha",
    "",
    "https://x.com/aaa",
    "https://x.com/aab",
    "---",
    "- https://x.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("a text line of a heading underlined inside a list item stays in place", () => {
  const headings = {
    "spaces": ["- a", "  - sub", "    https://x.com/zeta", "    ---"],
    "tab": ["- item", "\thttps://x.com/zeta", "\t---"],
  };
  for (const [name, heading] of Object.entries(headings)) {
    const before = note(...heading, "", "https://x.com/beta", "https://x.com/alpha", "");
    const after = note(...heading, "", "https://x.com/alpha", "https://x.com/beta", "");
    assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true }, name);
  }
});

Deno.test("a list item with an underline indented inside the item is a heading and stays in place", () => {
  for (const underline of ["  ---", "  ===", "\t---"]) {
    const before = note(
      "- https://x.com/zeta",
      underline,
      "",
      "- https://x.com/beta",
      "- https://x.com/alpha",
      "",
    );
    const after = note(
      "- https://x.com/zeta",
      underline,
      "",
      "- https://x.com/alpha",
      "- https://x.com/beta",
      "",
    );
    assertEquals(
      sortLinkLines(before),
      { content: after, links: 2, changed: true },
      JSON.stringify(underline),
    );
  }
});

Deno.test("a numbered line not starting at 1 under a text line is part of its underlined heading", () => {
  const heading = ["Intro https://x.com/zeta", "2. https://x.com/yyy", "==="];
  assertEquals(
    sortLinkLines(note(...heading, "", "- https://x.com/beta", "- https://x.com/alpha", "")),
    {
      content: note(...heading, "", "- https://x.com/alpha", "- https://x.com/beta", ""),
      links: 2,
      changed: true,
    },
  );
});

Deno.test("a numbered list right above a --- line gets sorted: its 2. and 3. lines are list items", () => {
  assertEquals(
    sortLinkLines(note("1. [[Zeta]]", "2. [[Mid]]", "3. [[Alpha]]", "---", "footer", "")),
    {
      content: note("1. [[Alpha]]", "2. [[Mid]]", "3. [[Zeta]]", "---", "footer", ""),
      links: 3,
      changed: true,
    },
  );
});

Deno.test("a 2. line under a blank line starts a list, so a --- under it is a divider", () => {
  assertEquals(
    sortLinkLines(note("- https://x.com/beta", "", "2. https://x.com/alpha", "---", "")),
    {
      content: note("- https://x.com/alpha", "", "2. https://x.com/beta", "---", ""),
      links: 2,
      changed: true,
    },
  );
});

Deno.test("a 2. line indented into a list item's text goes on with it, so both are heading text", () => {
  const heading = ["- https://x.com/zeta", "  2. https://x.com/yyy", "  ---"];
  assertEquals(
    sortLinkLines(note(...heading, "", "- https://x.com/beta", "- https://x.com/alpha", "")),
    {
      content: note(...heading, "", "- https://x.com/alpha", "- https://x.com/beta", ""),
      links: 2,
      changed: true,
    },
  );
});

Deno.test("a line indented 4+ columns under a heading's text goes on with it, also when it looks like a block start", () => {
  for (const line of ["    # cont", "    - cont", "    > cont"]) {
    const heading = ["https://z.com/zeta", line, "---", ""];
    assertEquals(
      sortLinkLines(note(...heading, "https://a.com/beta", "https://a.com/alpha", "")),
      {
        content: note(...heading, "https://a.com/alpha", "https://a.com/beta", ""),
        links: 2,
        changed: true,
      },
      line,
    );
  }
});

Deno.test("a --- indented 4 or more columns past the text is plain text, not an underline", () => {
  for (const underline of ["    ---", "\t---", "    ==="]) {
    assertEquals(
      sortLinkLines(note("https://z.com/zeta", underline, "", "https://a.com/alpha", "")),
      {
        content: note("https://a.com/alpha", underline, "", "https://z.com/zeta", ""),
        links: 2,
        changed: true,
      },
      JSON.stringify(underline),
    );
  }
  // Inside a list item the limit counts from the item's text: "  ---" under "- …" (text at
  // column 2) is an underline, "      ---" (6 columns, 4 past the text) is not.
  const item = ["- https://x.com/zeta", "      ---", ""];
  assertEquals(sortLinkLines(note(...item, "- https://x.com/alpha", "")), {
    content: note("- https://x.com/alpha", "      ---", "", "- https://x.com/zeta", ""),
    links: 2,
    changed: true,
  });
});

Deno.test("an underline indented less than the item's text is a divider, so the item gets sorted", () => {
  assertEquals(sortLinkLines(note("- [[Zeta]]", " ---", "- [[Alpha]]", "- [[Beta]]", "")), {
    content: note("- [[Alpha]]", " ---", "- [[Beta]]", "- [[Zeta]]", ""),
    links: 3,
    changed: true,
  });
});

Deno.test("a numbered line starting at 1 under a text line starts a list, so no heading stays", () => {
  const before = note(
    "Intro https://x.com/zeta",
    "1. https://x.com/yyy",
    "===",
    "",
    "- https://x.com/beta",
    "- https://x.com/alpha",
    "",
  );
  const after = note(
    "Intro https://x.com/zeta",
    "1. https://x.com/alpha",
    "===",
    "",
    "- https://x.com/beta",
    "- https://x.com/yyy",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 4, changed: true });
});

Deno.test("a --- under a one-line HTML comment is a divider, so the link above it gets sorted", () => {
  const middle = ["<!-- note -->", "---", ""];
  assertEquals(sortLinkLines(note("https://x.com/zeta", ...middle, "https://x.com/alpha", "")), {
    content: note("https://x.com/alpha", ...middle, "https://x.com/zeta", ""),
    links: 2,
    changed: true,
  });
});

Deno.test("a --- line under a list item or a blank line is a divider, so the link above it gets sorted", () => {
  assertEquals(sortLinkLines(note("- https://x.com/zeta", "---", "- https://x.com/alpha", "")), {
    content: note("- https://x.com/alpha", "---", "- https://x.com/zeta", ""),
    links: 2,
    changed: true,
  });
  assertEquals(sortLinkLines(note("https://x.com/zeta", "", "---", "https://x.com/alpha", "")), {
    content: note("https://x.com/alpha", "", "---", "https://x.com/zeta", ""),
    links: 2,
    changed: true,
  });
});

/**
 * Checks that the lines of `block` keep their places while the links around it get sorted:
 * beta above the block, zeta and alpha below it. Each block holds a link with the key "aaa":
 * if the block is not found, that link moves to the top; if the block does not end where it
 * should, it swallows zeta and alpha. Both give a different note text.
 */
function assertBlockStays(...block: string[]): void {
  const before = note(
    "- https://x.com/beta",
    ...block,
    "- https://x.com/zeta",
    "- https://x.com/alpha",
    "",
  );
  const after = note(
    "- https://x.com/alpha",
    ...block,
    "- https://x.com/beta",
    "- https://x.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 3, changed: true });
}

Deno.test("a code block ends at a closing fence line longer than its opening one", () => {
  assertBlockStays("```", "- https://x.com/aaa", "````");
});

Deno.test("spaces and tabs after the closing fence still close the code block", () => {
  assertBlockStays("```", "- https://x.com/aaa", "``` \t");
});

Deno.test("a ~~~ code block ends at its closing ~~~ line", () => {
  assertBlockStays("~~~", "- https://x.com/aaa", "~~~");
});

Deno.test("a code block that starts on a list item line stays in place", () => {
  assertBlockStays("- ```", "  https://x.com/aaa", "  ```");
  assertBlockStays("1. ```", "   https://x.com/aaa", "   ```");
});

Deno.test("a line that starts with ``` and has more backticks is inline code, not a code block", () => {
  const before = note("```a``` text", "- https://x.com/zeta", "- https://x.com/alpha", "");
  const after = note("```a``` text", "- https://x.com/alpha", "- https://x.com/zeta", "");
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("an Obsidian comment block (%% lines) stays in place", () => {
  assertBlockStays("%%", "- https://x.com/aaa", "%%");
});

Deno.test("a %% comment that starts after a link and ends on a later line keeps its lines in place", () => {
  assertBlockStays("- https://x.com/aaa %% my notes", "more notes %%");
});

Deno.test("a link line with a one-line %% comment is still sorted", () => {
  const before = note("- https://x.com/zeta %%read later%%", "- https://x.com/alpha", "");
  const after = note("- https://x.com/alpha", "- https://x.com/zeta %%read later%%", "");
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("an HTML comment block (<!-- to -->) stays in place", () => {
  assertBlockStays("<!--", "- https://x.com/aaa", "-->");
});

Deno.test("a one-line HTML comment does not hide the links below it", () => {
  const before = note("<!-- reading list -->", "- https://x.com/zeta", "- https://x.com/alpha", "");
  const after = note("<!-- reading list -->", "- https://x.com/alpha", "- https://x.com/zeta", "");
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("an HTML comment that ends and opens again on one line (--> <!--) keeps all its lines in place", () => {
  assertBlockStays("<!--", "- https://x.com/aaa", "--> <!--", "- https://x.com/aab", "-->");
});

Deno.test("a table without outer | stays in place up to the next blank line", () => {
  assertBlockStays(
    "Name | Link",
    "--- | ---",
    "x | https://x.com/aaa",
    "y | https://x.com/mid",
    "",
  );
});

Deno.test("a list right under a table, with no blank line, gets sorted", () => {
  const before = note(
    "| a | b |",
    "|---|---|",
    "| x | y |",
    "- https://x.com/zeta",
    "- https://x.com/alpha",
    "",
  );
  const after = note(
    "| a | b |",
    "|---|---|",
    "| x | y |",
    "- https://x.com/alpha",
    "- https://x.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("plain link lines under a heading right under a table get sorted", () => {
  const before = note(
    "a | b",
    "--- | ---",
    "1 | 2",
    "## Links",
    "https://z.com/zeta",
    "https://a.com/alpha",
    "",
  );
  const after = note(
    "a | b",
    "--- | ---",
    "1 | 2",
    "## Links",
    "https://a.com/alpha",
    "https://z.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("a link line that starts with an HTML comment stays, so no link moves into a table or heading above it", () => {
  const notes = {
    "under a table": note("| a | b |", "|---|---|", "| 1 | 2 |", "<!-- c --> https://z.com/zeta"),
    "above a heading": note("<!-- c --> https://z.com/zeta", "Title", "---"),
  };
  for (const [name, start] of Object.entries(notes)) {
    const before = start + "\n\nhttps://a.com/alpha\n";
    assertEquals(sortLinkLines(before), { content: before, links: 1, changed: false }, name);
  }
});

Deno.test("an empty HTML comment (<!--> or <!--->) ends in its own line, so the links below it get sorted", () => {
  for (const comment of ["<!-->", "<!--->"]) {
    assertEquals(
      sortLinkLines(note(comment, "- https://z.com/zeta", "- https://a.com/alpha", "")),
      {
        content: note(comment, "- https://a.com/alpha", "- https://z.com/zeta", ""),
        links: 2,
        changed: true,
      },
      comment,
    );
  }
});

Deno.test("a code block opened after two list markers stays in place", () => {
  for (const opener of ["- 1. ```", "- - ```", "1. - ```"]) {
    const block = [opener, "     - https://z.com/in", "     - https://a.com/in", "     ```"];
    assertEquals(
      sortLinkLines(note(...block, "- https://x.com/zeta", "- https://x.com/alpha", "")),
      {
        content: note(...block, "- https://x.com/alpha", "- https://x.com/zeta", ""),
        links: 2,
        changed: true,
      },
      opener,
    );
  }
});

Deno.test("an unclosed code block opened after a list marker ends where the list item ends", () => {
  // "  - https://z.com/in" is indented into the item's text, so it is still code; the next
  // line at the left edge ends the item and the code block.
  const before = note(
    "- ```",
    "  - https://z.com/in",
    "- https://z.com/zeta",
    "- https://a.com/alpha",
    "",
  );
  const after = note(
    "- ```",
    "  - https://z.com/in",
    "- https://a.com/alpha",
    "- https://z.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("a table ends at a code block or a comment right under it", () => {
  const table = ["Name | Link", "--- | ---", "x | https://x.com/aaa"];
  const blocks = [
    ["```", "code", "```"],
    ["%%", "hidden", "%%"],
    ["<!--", "hidden", "-->"],
    ["<!-- one line -->"],
  ];
  for (const block of blocks) {
    const before = note(...table, ...block, "https://x.com/zeta", "https://x.com/alpha", "");
    const after = note(...table, ...block, "https://x.com/alpha", "https://x.com/zeta", "");
    assertEquals(
      sortLinkLines(before),
      { content: after, links: 2, changed: true },
      `block ${block[0]}`,
    );
  }
});

Deno.test("a table ends at a divider line right under it, so the links after it get sorted", () => {
  const table = ["Name | Link", "--- | ---", "x | https://x.com/aaa"];
  for (const divider of ["---", "***", "___", "_ _ _"]) {
    const before = note(...table, divider, "https://x.com/zeta", "https://x.com/alpha", "");
    const after = note(...table, divider, "https://x.com/alpha", "https://x.com/zeta", "");
    assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true }, divider);
  }
});

Deno.test("a table with one column and no | in its header line stays in place", () => {
  const before = note(
    "Links",
    "|---|",
    "https://x.com/aaa",
    "",
    "https://x.com/zeta",
    "https://x.com/alpha",
    "",
  );
  const after = note(
    "Links",
    "|---|",
    "https://x.com/aaa",
    "",
    "https://x.com/alpha",
    "https://x.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("a --- under a table is a divider, so the link line above the table gets sorted", () => {
  const table = ["| a | b |", "|---|---|", "| c | d |", "---", ""];
  assertEquals(sortLinkLines(note("https://x.com/zeta", ...table, "https://x.com/alpha", "")), {
    content: note("https://x.com/alpha", ...table, "https://x.com/zeta", ""),
    links: 2,
    changed: true,
  });
});

Deno.test("a line right above a table divider stays, so a moved link with | never makes a table", () => {
  const before = note(
    "https://x.com/zeta",
    "|---|---|",
    "",
    "https://x.com/beta",
    "[[Aaa|alias]]",
    "",
  );
  const after = note(
    "https://x.com/zeta",
    "|---|---|",
    "",
    "[[Aaa|alias]]",
    "https://x.com/beta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("a list item right after a table inside a list item gets sorted", () => {
  const before = note(
    "- https://x.com/zeta",
    "  | a | b |",
    "  |---|---|",
    "  | c | d |",
    "- https://x.com/alpha",
    "",
  );
  const after = note(
    "- https://x.com/alpha",
    "  | a | b |",
    "  |---|---|",
    "  | c | d |",
    "- https://x.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("the divider line under a table header stays in the table, also when it starts with '- '", () => {
  assertBlockStays("Name | Link", "- | -", "x | https://x.com/aaa");
});

Deno.test("a heading with a tab after the # stays in place", () => {
  assertBlockStays("#\thttps://x.com/aaa");
});

Deno.test("a quote indented with a tab stays in place", () => {
  assertBlockStays("\t> https://x.com/aaa");
});

// --- Lines that look special but are link lines ---

Deno.test("a #tag line with a link is not a heading and gets sorted", () => {
  const before = note("#later https://x.com/zeta", "https://x.com/alpha", "");
  const after = note("https://x.com/alpha", "#later https://x.com/zeta", "");
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

Deno.test("a line with 7 # is not a heading, so its link gets sorted", () => {
  const before = note("####### https://x.com/zeta", "https://x.com/alpha", "");
  const after = note("https://x.com/alpha", "####### https://x.com/zeta", "");
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
});

// --- List-item link lines and plain link lines sort apart ---

Deno.test("list-item link lines and plain link lines are sorted apart, each kind in its own places", () => {
  const before = note(
    "# Links",
    "- https://x.com/zeta",
    "- [ ] [[Mango]]",
    "1. https://x.com/delta",
    "",
    "Source: https://y.com/yellow",
    "Seen in [[Banana]]",
    "",
    "## More",
    "  - https://x.com/alpha",
    "",
  );
  const after = note(
    "# Links",
    "- https://x.com/alpha",
    "- https://x.com/delta",
    "1. [ ] [[Mango]]",
    "",
    "Seen in [[Banana]]",
    "Source: https://y.com/yellow",
    "",
    "## More",
    "  - https://x.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 6, changed: true });
});

// Notes where a plain link line in a list-item place would change what the line is.
const PLAIN_ABOVE_DIVIDER = note(
  "# Project",
  "Kickoff notes: [[Meeting]]",
  "",
  "## Links",
  "- https://github.com/org/api",
  "---",
  "## Done",
  "",
);
const PLAIN_ABOVE_DIVIDER_SORTED_LIST = note(
  "Source: [[Zeta index]]",
  "",
  "## Links",
  "- https://b.com/beta",
  "- https://a.com/alpha",
  "---",
  "Footer text",
  "",
);
const PLAIN_UNDER_TABLE = note(
  "| Tool | Use |",
  "| --- | --- |",
  "| Git | code |",
  "- https://b.com/zeta",
  "See https://a.com/alpha",
);
const PLAIN_UNDER_TABLE_WITH_LINK = note(
  "| Name | Link |",
  "| --- | --- |",
  "| Spec | [[Spec]] |",
  "- https://b.com/beta",
  "See also https://a.com/alpha",
  "",
);

Deno.test("a plain link line never moves above a --- divider, where it would become a heading", () => {
  assertEquals(sortLinkLines(PLAIN_ABOVE_DIVIDER), {
    content: PLAIN_ABOVE_DIVIDER,
    links: 2,
    changed: false,
  });
  assertEquals(sortLinkLines(PLAIN_ABOVE_DIVIDER_SORTED_LIST), {
    content: note(
      "Source: [[Zeta index]]",
      "",
      "## Links",
      "- https://a.com/alpha",
      "- https://b.com/beta",
      "---",
      "Footer text",
      "",
    ),
    links: 3,
    changed: true,
  });
});

Deno.test("a plain link line never moves right under a table, where it would become a table row", () => {
  for (
    const [name, before] of Object.entries({ PLAIN_UNDER_TABLE, PLAIN_UNDER_TABLE_WITH_LINK })
  ) {
    assertEquals(sortLinkLines(before), { content: before, links: 2, changed: false }, name);
  }
});

Deno.test("sorting a note with both kinds of link lines again changes nothing and finds the same links", () => {
  for (
    const [name, before] of Object.entries({
      PLAIN_ABOVE_DIVIDER,
      PLAIN_ABOVE_DIVIDER_SORTED_LIST,
      PLAIN_UNDER_TABLE,
      PLAIN_UNDER_TABLE_WITH_LINK,
    })
  ) {
    const first = sortLinkLines(before);
    assertEquals(
      sortLinkLines(first.content),
      { content: first.content, links: first.links, changed: false },
      name,
    );
  }
});

// --- A plain place keeps its start: its leading spaces and tabs ---

Deno.test("a plain link line inside a nested list item keeps the tab indent of its place, so no link becomes code or leaves the list", () => {
  const before = note(
    "## Books",
    "- Fiction",
    "\t- Dune",
    "\t  https://example.com/dune",
    "",
    "## Articles",
    "https://a.com/alpha",
    "",
  );
  const after = note(
    "## Books",
    "- Fiction",
    "\t- Dune",
    "\t  https://a.com/alpha",
    "",
    "## Articles",
    "https://example.com/dune",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
  assertEquals(sortLinkLines(after), { content: after, links: 2, changed: false });
});

Deno.test("a plain place indented with 4 spaces keeps them, so the list stays one list and the moved link is not code", () => {
  const before = note(
    "- Deep Work",
    "",
    "    https://z.com/zeta",
    "- Atomic Habits",
    "",
    "## More",
    "https://a.com/alpha",
    "",
  );
  const after = note(
    "- Deep Work",
    "",
    "    https://a.com/alpha",
    "- Atomic Habits",
    "",
    "## More",
    "https://z.com/zeta",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
  assertEquals(sortLinkLines(after), { content: after, links: 2, changed: false });
});

Deno.test("the text before a link in a plain line moves with the link, only the leading tab stays", () => {
  const before = note(
    "## Tasks",
    "- [ ] Fix login",
    "\tDocs: https://docs.example.com/zeta-api",
    "",
    "## Links",
    "",
    "https://github.com/org/app/pull/42",
    "",
  );
  const after = note(
    "## Tasks",
    "- [ ] Fix login",
    "\thttps://github.com/org/app/pull/42",
    "",
    "## Links",
    "",
    "Docs: https://docs.example.com/zeta-api",
    "",
  );
  assertEquals(sortLinkLines(before), { content: after, links: 2, changed: true });
  assertEquals(sortLinkLines(after), { content: after, links: 2, changed: false });
});

// --- Line endings and small notes ---

Deno.test("each place keeps its own line ending in a Windows note without a final line break", () => {
  assertEquals(sortLinkLines("# R\r\n- https://x.com/zeta\r\n- https://x.com/alpha"), {
    content: "# R\r\n- https://x.com/alpha\r\n- https://x.com/zeta",
    links: 2,
    changed: true,
  });
});

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
    "- [[10-tips]]",
    "- [[2-tips]]",
    "",
  ));
  assertEquals(
    first.content,
    note(
      "- [[2-tips]]",
      "- [[10-tips]]",
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
  assertEquals(lineChanges("- [[Zeta]]\r\n- [[Alpha]]", "- [[Alpha]]\r\n- [[Zeta]]"), [
    { from: { line: 0, ch: 0 }, to: { line: 0, ch: 10 }, text: "- [[Alpha]]" },
    { from: { line: 1, ch: 0 }, to: { line: 1, ch: 11 }, text: "- [[Zeta]]" },
  ]);
});

Deno.test("a note with no changed line gives no editor changes", () => {
  const text = note("- https://a.com/alpha", "- https://b.com/zeta", "");
  assertEquals(lineChanges(text, text), []);
});

Deno.test("editor changes are refused when the line count differs, so no line is put in a wrong place", () => {
  assertThrows(() => lineChanges("a\nb", "a"), Error, "line count changed: 2 → 1");
});
