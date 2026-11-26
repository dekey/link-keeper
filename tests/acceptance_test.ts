// One test per acceptance criterion in docs/plan/done/v0.1.md, plus the "Sort links in current
// note" command (SPEC.md, "Sorting links"), run against the built plugin/main.js inside
// a fake vault (see fake_obsidian.ts).

import { assertEquals, assertInstanceOf } from "@std/assert";
import { Harness } from "./fake_obsidian.ts";

const TO_TARGET = "add-link-to-target-note";
const TO_CURRENT = "add-link-to-current-note";
const SELECTION = "add-selection-to-target-note";
const SORT = "sort-links-in-current-note";

Deno.test("AC1: with no Links.md, adding a link creates the note with that link", async () => {
  const vault = await Harness.start();
  assertEquals(vault.note("Links.md"), undefined);

  await vault.addViaDialog(TO_TARGET, "https://example.com");

  assertEquals(vault.note("Links.md"), "- https://example.com\n");
  assertEquals(vault.lastNotice(), {
    message: "✅ Added to “Links”:\nhttps://example.com",
    duration: 4000,
  });
});

Deno.test("AC2: adding the same link again warns and leaves the note byte-for-byte unchanged", async () => {
  const vault = await Harness.start();
  await vault.addViaDialog(TO_TARGET, "https://example.com");
  const before = vault.note("Links.md");

  await vault.addViaDialog(TO_TARGET, "https://example.com");

  assertEquals(vault.note("Links.md"), before);
  assertEquals(vault.lastNotice(), {
    message: "⚠️ Already in “Links”:\nhttps://example.com",
    duration: 6000,
  });
});

Deno.test("AC3: http://www.example.com/ counts as a duplicate of https://example.com", async () => {
  const vault = await Harness.start();
  await vault.addViaDialog(TO_TARGET, "https://example.com");

  await vault.addViaDialog(TO_TARGET, "http://www.example.com/");

  assertEquals(vault.note("Links.md"), "- https://example.com\n");
  assertEquals(vault.lastNotice()?.message, "⚠️ Already in “Links”:\nhttp://www.example.com/");
});

Deno.test("AC4: a different link is appended as a second line at the end", async () => {
  const vault = await Harness.start();
  await vault.addViaDialog(TO_TARGET, "https://example.com");

  await vault.addViaDialog(TO_TARGET, "https://example.com/other");

  assertEquals(vault.note("Links.md"), "- https://example.com\n- https://example.com/other\n");
  assertEquals(vault.lastNotice()?.message, "✅ Added to “Links”:\nhttps://example.com/other");
});

Deno.test("AC5: a note whose last line has no line break gets the link on a new line", async () => {
  const vault = await Harness.start({ notes: { "Links.md": "# Reading\n- https://a.dev" } });

  await vault.addViaDialog(TO_TARGET, "https://example.com");

  assertEquals(vault.note("Links.md"), "# Reading\n- https://a.dev\n- https://example.com\n");
});

Deno.test("AC6: a link inside a sentence or a [title](url) link is a duplicate", async () => {
  const note =
    "I liked https://example.com/article, a lot.\n[Guide](https://docs.example.com/guide)\n";
  const vault = await Harness.start({ notes: { "Links.md": note } });

  await vault.addViaDialog(TO_TARGET, "https://example.com/article");
  await vault.addViaDialog(TO_TARGET, "https://docs.example.com/guide");

  assertEquals(vault.note("Links.md"), note);
  assertEquals(vault.notices.map((n) => n.message), [
    "⚠️ Already in “Links”:\nhttps://example.com/article",
    "⚠️ Already in “Links”:\nhttps://docs.example.com/guide",
  ]);
});

Deno.test("AC7: [[My Note]] is added once and [[my note]] is reported as a duplicate", async () => {
  const vault = await Harness.start();

  await vault.addViaDialog(TO_TARGET, "[[My Note]]");
  await vault.addViaDialog(TO_TARGET, "[[my note]]");

  assertEquals(vault.note("Links.md"), "- [[My Note]]\n");
  assertEquals(vault.lastNotice()?.message, "⚠️ Already in “Links”:\n[[my note]]");
});

Deno.test("AC8: changing Target note to Inbox/Reading.md creates the folder and note on the next add", async () => {
  const vault = await Harness.start();

  await vault.changeSetting("Target note", "Inbox/Reading.md");
  await vault.addViaDialog(TO_TARGET, "https://example.com");

  assertEquals(vault.vault.folders.has("Inbox"), true);
  assertEquals(vault.note("Inbox/Reading.md"), "- https://example.com\n");
  assertEquals(vault.note("Links.md"), undefined);
  assertEquals(vault.lastNotice()?.message, "✅ Added to “Reading”:\nhttps://example.com");
  assertEquals((vault.savedSettings() as { targetNote: string }).targetNote, "Inbox/Reading.md");
});

Deno.test("AC9: changing Line format to '- [ ] {link}' writes new links as tasks", async () => {
  const vault = await Harness.start();

  await vault.changeSetting("Line format", "- [ ] {link}");
  await vault.addViaDialog(TO_TARGET, "https://example.com");

  assertEquals(vault.note("Links.md"), "- [ ] https://example.com\n");
});

Deno.test("AC10a: with a URL on the clipboard, the dialog opens pre-filled and selected", async () => {
  const vault = await Harness.start({ clipboard: "  https://example.com/from-clipboard\n" });

  await vault.run(TO_TARGET);

  assertEquals(vault.dialogInput().value, "https://example.com/from-clipboard");
  assertEquals(vault.dialogInput().selected, true);
});

Deno.test("AC10b: with 'Pre-fill from clipboard' off, the dialog opens empty", async () => {
  const vault = await Harness.start({ clipboard: "https://example.com/from-clipboard" });

  await vault.changeSetting("Pre-fill from clipboard", false);
  await vault.run(TO_TARGET);

  assertEquals(vault.dialogInput().value, "");
});

Deno.test("AC10c: clipboard text that is not one web address leaves the dialog empty", async () => {
  const vault = await Harness.start({ clipboard: "see https://example.com" });

  await vault.run(TO_TARGET);

  assertEquals(vault.dialogInput().value, "");
});

Deno.test("AC10d: a clipboard that cannot be read opens the dialog empty with no error", async () => {
  const vault = await Harness.start();

  await vault.run(TO_TARGET);

  assertEquals(vault.dialogInput().value, "");
  assertEquals(vault.notices, []);
});

Deno.test("AC11: 'Add link to current note' checks and writes the open note, not the target note", async () => {
  // The link is already in Links.md but not in the open note: it must still be added.
  const vault = await Harness.start({
    notes: { "Links.md": "- https://example.com\n", "Daily/Today.md": "# Today\n" },
    activeFile: "Daily/Today.md",
  });

  await vault.addViaDialog(TO_CURRENT, "https://example.com");

  assertEquals(vault.note("Daily/Today.md"), "# Today\n- https://example.com\n");
  assertEquals(vault.note("Links.md"), "- https://example.com\n");
  assertEquals(vault.lastNotice()?.message, "✅ Added to “Today”:\nhttps://example.com");

  await vault.addViaDialog(TO_CURRENT, "https://example.com");
  assertEquals(vault.note("Daily/Today.md"), "# Today\n- https://example.com\n");
  assertEquals(vault.lastNotice()?.message, "⚠️ Already in “Today”:\nhttps://example.com");
});

Deno.test("AC12a: 'Add selected link' adds the selected text to the target note", async () => {
  const vault = await Harness.start();

  assertEquals(vault.isAvailable(SELECTION, "https://example.com/selected"), true);
  await vault.runWithSelection(SELECTION, "  https://example.com/selected ");

  assertEquals(vault.note("Links.md"), "- https://example.com/selected\n");
});

Deno.test("AC12b: 'Add selected link' is hidden when nothing is selected", async () => {
  const vault = await Harness.start();

  assertEquals(vault.isAvailable(SELECTION, ""), false);
  assertEquals(vault.isAvailable(SELECTION, "   "), false);
});

// Spec edge cases that the fixes depend on.

Deno.test("'Add link to current note' is hidden when no note is open", async () => {
  const vault = await Harness.start();

  assertEquals(vault.isAvailable(TO_CURRENT), false);
});

Deno.test("'Add link to current note' is hidden for a canvas, so the canvas file is never changed", async () => {
  const vault = await Harness.start({
    notes: { "Board.canvas": '{"nodes":[],"edges":[]}' },
    activeFile: "Board.canvas",
  });

  assertEquals(vault.isAvailable(TO_CURRENT), false);
});

// "Sort links in current note": the note open in the editor (SPEC.md, "Sorting links").

// The SPEC "Sorting links" Before/After example: two blocks split by a text line. Keys: zeta and
// 2-intro in the first block; link-keeper and 2 in the second.
const BEFORE = "# Reading\n" +
  "- https://b.com/zeta\n" +
  "- https://a.com/2-intro\n" +
  "Some text\n" +
  "1. https://github.com/dekey/link-keeper\n" +
  "2. [ ] https://github.com/dekey/link-keeper/pull/2\n";
const AFTER = "# Reading\n" +
  "- https://a.com/2-intro\n" +
  "- https://b.com/zeta\n" +
  "Some text\n" +
  "1. [ ] https://github.com/dekey/link-keeper/pull/2\n" +
  "2. https://github.com/dekey/link-keeper\n";

/** The editor changes that turn BEFORE into AFTER: lines 1, 2, 4 and 5 change, the others stay. */
const SORT_CHANGES = [
  { from: { line: 1, ch: 0 }, to: { line: 1, ch: 20 }, text: "- https://a.com/2-intro" },
  { from: { line: 2, ch: 0 }, to: { line: 2, ch: 23 }, text: "- https://b.com/zeta" },
  {
    from: { line: 4, ch: 0 },
    to: { line: 4, ch: 39 },
    text: "1. [ ] https://github.com/dekey/link-keeper/pull/2",
  },
  {
    from: { line: 5, ch: 0 },
    to: { line: 5, ch: 50 },
    text: "2. https://github.com/dekey/link-keeper",
  },
];

/** The one editor step of a sort: the changes, named by the plugin so undo keeps it apart. */
const SORT_STEP = { changes: SORT_CHANGES, origin: "link-keeper.sort" };

/** Runs `run` with console.error replaced, and returns the arguments of every call. */
async function withConsoleErrors<T>(
  run: () => Promise<T>,
): Promise<{ result: T; errors: unknown[][] }> {
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  try {
    return { result: await run(), errors };
  } finally {
    console.error = original;
  }
}

Deno.test("sorting puts each block of link lines of the editor text in order in one editor step that changes only the moved lines, unsaved edits included, and says how many links were sorted", async () => {
  // The saved note is older than the editor text: the sort must use the editor text.
  const saved = "# Reading\n- https://b.com/zeta\n- https://a.com/alpha\n";
  const vault = await Harness.start({ notes: { "Daily/Reading.md": saved } });

  const editor = await vault.runInEditor(SORT, "Daily/Reading.md", BEFORE);

  assertEquals(editor.getValue(), AFTER);
  assertEquals(editor.transactions, [SORT_STEP]);
  assertEquals(vault.notices, [{ message: "✅ Sorted 4 links in “Reading”", duration: 4000 }]);
});

Deno.test("the sort pop-up counts every link line, also the ones that did not move and blocks of one line", async () => {
  const text =
    "- https://x.com/zeta\n- https://x.com/beta\n- https://x.com/alpha\n\nhttps://y.com/solo\n";
  const vault = await Harness.start({ notes: { "Daily/Reading.md": text } });

  const editor = await vault.runInEditor(SORT, "Daily/Reading.md", text);

  assertEquals(
    editor.getValue(),
    "- https://x.com/alpha\n- https://x.com/beta\n- https://x.com/zeta\n\nhttps://y.com/solo\n",
  );
  assertEquals(vault.notices, [{ message: "✅ Sorted 4 links in “Reading”", duration: 4000 }]);
});

Deno.test("after sorting, the cursor is back on the same line and character, also on a line that changed", async () => {
  const vault = await Harness.start({ notes: { "Daily/Reading.md": BEFORE } });

  const editor = await vault.runInEditor(SORT, "Daily/Reading.md", BEFORE, {
    cursor: { line: 1, ch: 3 },
  });

  assertEquals(editor.transactions, [SORT_STEP]);
  assertEquals(editor.getCursor(), { line: 1, ch: 3 });
});

Deno.test("a cursor at the end of a link line that gets a shorter line stays on that line, at its end", async () => {
  const text = "- https://x.com/zeta-long-name\n- https://x.com/alpha\nSome text\n";
  const vault = await Harness.start({ notes: { "Daily/Reading.md": text } });

  const editor = await vault.runInEditor(SORT, "Daily/Reading.md", text, {
    cursor: { line: 0, ch: 30 },
  });

  assertEquals(
    editor.getValue(),
    "- https://x.com/alpha\n- https://x.com/zeta-long-name\nSome text\n",
  );
  assertEquals(editor.getCursor(), { line: 0, ch: 21 });
});

Deno.test("a cursor past the new end of a shortened link line is moved back to its end, so the sort does not fail", async () => {
  const vault = await Harness.start({ notes: { "Daily/Reading.md": BEFORE } });

  // Line 5 is "2. [ ] https://github.com/dekey/link-keeper/pull/2" (50 characters); after the
  // sort it is "2. https://github.com/dekey/link-keeper" (39 characters), and the place 50 is
  // past the end of the note.
  const editor = await vault.runInEditor(SORT, "Daily/Reading.md", BEFORE, {
    cursor: { line: 5, ch: 50 },
  });

  assertEquals(editor.getValue(), AFTER);
  assertEquals(editor.getCursor(), { line: 5, ch: 39 });
  assertEquals(vault.notices, [{ message: "✅ Sorted 4 links in “Reading”", duration: 4000 }]);
});

Deno.test("sorting changes only the editor text, never the vault notes", async () => {
  const links = "- https://b.com/zeta\n- https://a.com/alpha\n";
  const vault = await Harness.start({ notes: { "Links.md": links, "Daily/Reading.md": BEFORE } });

  const editor = await vault.runInEditor(SORT, "Daily/Reading.md", BEFORE);

  assertEquals(editor.getValue(), AFTER);
  assertEquals(vault.note("Daily/Reading.md"), BEFORE);
  assertEquals(vault.note("Links.md"), links);
});

Deno.test("an already sorted note is not rewritten and the pop-up says the links are in order", async () => {
  const vault = await Harness.start({ notes: { "Daily/Reading.md": AFTER } });

  const editor = await vault.runInEditor(SORT, "Daily/Reading.md", AFTER, {
    cursor: { line: 2, ch: 3 },
  });

  assertEquals(editor.transactions, []);
  assertEquals(editor.getValue(), AFTER);
  assertEquals(editor.getCursor(), { line: 2, ch: 3 });
  assertEquals(vault.notices, [
    { message: "Links in “Reading” are already in order", duration: 4000 },
  ]);
});

Deno.test("a note with no links is not rewritten and gets the 'already in order' pop-up", async () => {
  const text = "# Reading\nSome text\n";
  const vault = await Harness.start({ notes: { "Daily/Reading.md": text } });

  const editor = await vault.runInEditor(SORT, "Daily/Reading.md", text);

  assertEquals(editor.transactions, []);
  assertEquals(editor.getValue(), text);
  assertEquals(vault.notices, [
    { message: "Links in “Reading” are already in order", duration: 4000 },
  ]);
});

Deno.test("'Sort links in current note' is hidden when the editor has no file", async () => {
  const vault = await Harness.start();

  assertEquals(vault.isAvailable(SORT), false);
});

Deno.test("'Sort links in current note' is hidden for a canvas", async () => {
  const vault = await Harness.start({
    notes: { "Board.canvas": '{"nodes":[],"edges":[]}' },
    activeFile: "Board.canvas",
  });

  assertEquals(vault.isAvailable(SORT), false);
});

Deno.test("when the editor cannot be written, an error pop-up points to the console and the error is logged", async () => {
  const vault = await Harness.start({ notes: { "Daily/Reading.md": BEFORE } });

  const { result: editor, errors } = await withConsoleErrors(() =>
    vault.runInEditor(SORT, "Daily/Reading.md", BEFORE, { failOnWrite: true })
  );

  assertEquals(editor.transactions, [SORT_STEP]);
  assertEquals(vault.notices, [
    {
      message: "Link Keeper: could not sort the links — see the developer console.",
      duration: undefined,
    },
  ]);
  assertEquals(errors.length, 1);
  assertEquals(errors[0][0], "Link Keeper:");
  assertInstanceOf(errors[0][1], Error);
  assertEquals(errors[0][1].message, "editor write failed");
});
