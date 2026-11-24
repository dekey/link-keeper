// One test per acceptance criterion in docs/plan/done/v0.1.md, run against the built
// plugin/main.js inside a fake vault (see fake_obsidian.ts).

import { assertEquals } from "@std/assert";
import { Harness } from "./fake_obsidian.ts";

const TO_TARGET = "add-link-to-target-note";
const TO_CURRENT = "add-link-to-current-note";
const SELECTION = "add-selection-to-target-note";

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
