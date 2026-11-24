import { assertEquals } from "@std/assert";
import {
  addLinkToContent,
  appendLine,
  containsLink,
  formatLine,
  isMarkdownNote,
  isUrl,
  withMarkdownExtension,
} from "../src/links.ts";

// --- Duplicate rules for web links (spec: "Duplicate detection rules") ---

Deno.test("web link matching ignores www, domain capitals and trailing slash", () => {
  assertEquals(containsLink("- https://www.Example.com/page/\n", "https://example.com/page"), true);
});

Deno.test("web link matching treats http and https as the same", () => {
  assertEquals(containsLink("- https://example.com/page\n", "http://example.com/page/"), true);
});

Deno.test("web link inside brackets with a full stop after it is a duplicate", () => {
  assertEquals(containsLink("see (https://foo.dev/a?x=1).\n", "https://foo.dev/a?x=1"), true);
});

Deno.test("web link inside a Markdown link is a duplicate", () => {
  assertEquals(
    containsLink("[Example](https://example.com/page)\n", "https://example.com/page"),
    true,
  );
});

Deno.test("web link with a different query is a new link", () => {
  assertEquals(containsLink("- https://foo.dev/a?x=1\n", "https://foo.dev/a?x=2"), false);
});

Deno.test("web link path is compared with capital letters", () => {
  assertEquals(containsLink("- https://example.com/page\n", "https://example.com/Page"), false);
});

Deno.test("web link anchor must match exactly", () => {
  assertEquals(
    containsLink("- https://example.com/page#intro\n", "https://example.com/page#end"),
    false,
  );
});

// Bug fix: brackets inside the address used to cut the stored link short.
Deno.test("web link with round brackets in the path is a duplicate of itself", () => {
  const link = "https://en.wikipedia.org/wiki/Mercury_(planet)";
  assertEquals(containsLink(`- ${link}\n`, link), true);
});

Deno.test("web link with round brackets inside a Markdown link is a duplicate", () => {
  const link = "https://en.wikipedia.org/wiki/Mercury_(planet)";
  assertEquals(containsLink(`[Mercury](${link})\n`, link), true);
});

Deno.test("web link with brackets is not matched by the same link without them", () => {
  assertEquals(
    containsLink(
      "- https://en.wikipedia.org/wiki/Mercury_\n",
      "https://en.wikipedia.org/wiki/Mercury_(planet)",
    ),
    false,
  );
});

// Bug fix: the port used to be dropped, so different servers counted as one.
Deno.test("web link on a different port is a new link", () => {
  assertEquals(
    containsLink("- https://example.com/page\n", "https://example.com:8080/page"),
    false,
  );
});

Deno.test("web link on the same port is a duplicate", () => {
  assertEquals(
    containsLink("- https://example.com:8080/page\n", "https://example.com:8080/page/"),
    true,
  );
});

Deno.test("web link with the default https port written out is a duplicate", () => {
  assertEquals(containsLink("- https://example.com/page\n", "https://example.com:443/page"), true);
});

// --- Duplicate rules for wiki links and plain text ---

Deno.test("wiki link matching ignores capital letters", () => {
  assertEquals(containsLink("- [[My Note]]\n", "[[my note]]"), true);
});

Deno.test("wiki link with an alias is a different link", () => {
  assertEquals(containsLink("- [[My Note|alias]]\n", "[[My Note]]"), false);
});

// --- Writing the new line (spec: "Appending rules") ---

Deno.test("default line format writes a list item", () => {
  assertEquals(formatLine("- {link}", "https://example.com"), "- https://example.com");
});

Deno.test("task line format writes a task", () => {
  assertEquals(formatLine("- [ ] {link}", "https://example.com"), "- [ ] https://example.com");
});

// Bug fix: a format without {link} used to write a line without the link.
Deno.test("line format without {link} falls back to the default so the link is kept", () => {
  assertEquals(formatLine("- ", "https://example.com"), "- https://example.com");
});

Deno.test("dollar signs in the link are written as they are", () => {
  assertEquals(formatLine("- {link}", "https://example.com/$&"), "- https://example.com/$&");
});

Deno.test("first link in an empty note becomes its first line", () => {
  assertEquals(appendLine("", "- a"), "- a\n");
});

Deno.test("note without a final line break gets the link on a new line", () => {
  assertEquals(appendLine("# Links\n- a", "- b"), "# Links\n- a\n- b\n");
});

Deno.test("note with a final line break gets no blank line before the link", () => {
  assertEquals(appendLine("- a\n", "- b"), "- a\n- b\n");
});

// --- Whole add step (spec: acceptance criteria) ---

Deno.test("adding a duplicate leaves the note byte-for-byte unchanged", () => {
  const note = "# Links\n- https://example.com";
  assertEquals(addLinkToContent(note, "http://www.example.com/", "- {link}"), {
    content: note,
    added: false,
  });
});

Deno.test("adding a new link appends it as typed, not normalized", () => {
  assertEquals(
    addLinkToContent("- https://example.com\n", "https://Example.com/other/", "- {link}"),
    {
      content: "- https://example.com\n- https://Example.com/other/\n",
      added: true,
    },
  );
});

// --- Which notes and paths are used ---

// Bug fix: "Add link to current note" used to write into canvas and PDF files.
Deno.test("only Markdown files count as notes for adding links", () => {
  assertEquals(
    ["md", "canvas", "pdf", "png"].map(isMarkdownNote),
    [true, false, false, false],
  );
});

Deno.test("target note path gets .md when it has none", () => {
  assertEquals(withMarkdownExtension("Inbox/Reading"), "Inbox/Reading.md");
});

Deno.test("target note path that already ends with .md is kept", () => {
  assertEquals(withMarkdownExtension("Inbox/Reading.MD"), "Inbox/Reading.MD");
});

Deno.test("clipboard text counts as a web link only when it is one address", () => {
  assertEquals(
    [
      "https://example.com",
      "  https://example.com  ",
      "see https://example.com",
      "https://a.com\nmore",
    ]
      .map(isUrl),
    [true, true, false, false],
  );
});
