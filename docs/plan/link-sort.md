# Sort links in current note

## Overview

- New command **Sort links in current note**. It sorts the lines that hold a link in the
  Markdown note open in the editor.
- Problem: a note that collects links (reading list, bookmarks) grows in the order links were
  added. Finding a link by eye gets hard. Sorting by hand is slow.
- Adding links does not change: a new link still goes at the end of the note (SPEC.md,
  "Appending rules"). The user runs the sort command when they want order.
- The command lives next to the add commands in `src/main.ts`. The sort rules live in a new
  file with no Obsidian imports, so they are tested on their own, like `src/links.ts`.

## Context (from discovery)

- Files involved:
  - `src/links.ts` — link rules, no Obsidian imports. Holds `URL_RE` (finds web addresses,
    keeps one pair of round brackets, has the `g` flag) and `TRAILING_PUNCTUATION`. Both are
    private today.
  - `src/main.ts` — commands. "Add selected link to target note" already uses
    `editorCheckCallback`; "Add link to current note" shows the Markdown-only check
    (`isMarkdownNote(file.extension)`).
  - `tests/links_test.ts` — rule tests. `tests/acceptance_test.ts` + `tests/fake_obsidian.ts`
    — fake vault that loads the built `plugin/main.js`. The fake editor today has only
    `getSelection()` and gets no `ctx`.
  - `SPEC.md`, `README.md` — behaviour docs.
- Obsidian API (checked in `obsidian@1.14.4` types): `editorCheckCallback(checking, editor,
  ctx: MarkdownView | MarkdownFileInfo)`; `Editor.getValue()`, `setValue()`, `getCursor()`,
  `setCursor()`.
- Patterns found:
  - Pop-ups: `new Notice(text, ms)`; errors are logged with `console.error("Link Keeper:", err)`.
  - Test names describe the rule, not the function. Tests check exact note text.
- Dependencies: none new. TypeScript on Deno, no Node or npm. `Intl.Collator` is built in.

## Development Approach

- **testing approach**: Regular (code first, then tests in the same task)
- complete each task fully before moving to the next
- make small, focused changes
- **CRITICAL: every task MUST include new/updated tests** for code changes in that task
  - tests are not optional - they are a required part of the checklist
  - write unit tests for new functions/methods
  - write unit tests for modified functions/methods
  - add new test cases for new code paths
  - update existing test cases if behavior changes
  - tests cover both success and error scenarios
- **CRITICAL: all tests must pass before starting next task** - no exceptions
- **CRITICAL: update this plan file when scope changes during implementation**
- run tests after each change: `make test` (builds `plugin/main.js` first, then runs all tests)
- maintain backward compatibility: the add commands and their tests must not change behaviour

## Testing Strategy

- **unit tests**: `tests/sort_test.ts` for the sort key, the order and the note sort (pure
  functions, exact input → exact output).
- **acceptance tests**: `tests/acceptance_test.ts` in the fake vault for the command: exact
  editor text after the sort, cursor, the full pop-up record `{ message, duration }`, when the
  command is hidden, the error path.
- No UI e2e tests in this project (no Playwright or similar).
- Test names follow the business rule, e.g. "links are ordered by the last part of the address,
  digits before letters".
- Every test must fail if the rule it names breaks: use input pairs where the wrong rule gives a
  different result (see the named pairs in Tasks 1–3).

## Progress Tracking

- mark completed items with `[x]` immediately when done
- add newly discovered tasks with ➕ prefix
- document issues/blockers with ⚠️ prefix
- update plan if implementation deviates from original scope
- keep plan in sync with actual work done

## Solution Overview

1. **Find the link lines.** A link line is a line that holds a web address (`http://`,
   `https://`) or a note link (`[[…]]`), except:
   - lines in the frontmatter (`---` block at the top) or in a fenced code block;
   - headings (`#`, `##`, …), table rows (line starts with `|`), quotes and callouts (line
     starts with `>`). Leading spaces are ignored for this check.
2. **Give each link line a sort key.** The key is the last part of the line's first link: the
   text after the last `/`, up to `?` or `#`.
3. **Sort the link lines** by key in natural order: 0–9 before a–z, numbers by value
   (`2-tips` before `10-tips`), capital letters ignored.
4. **Put them back into the link slots.** All other lines keep their exact places. Link lines
   fill the places where link lines were, in sorted order, so a link can move to another
   section of the note. Each slot keeps its own line ending.
5. **Write through the editor and tell the user.** The command reads the open editor's text,
   sorts it, and writes it back with `editor.setValue()` only when the order changed. The
   cursor is put back where it was. A pop-up says how many links were sorted, or that they were
   already in order.

Key decisions (from the user):

- Separate command, not sorting on add: adding stays as SPEC.md says ("Nothing else in the
  note moves or changes").
- Current note only: no "sort target note" command.
- All link lines in the whole note sort together, not per block.
- Sort key: last part of the link, up to `?`; order 0–9, then a–z (natural order).
- Headings, tables, quotes and callouts never move (review finding #4).
- Write through the Editor API, not `vault.process`, so Ctrl/Cmd+Z can undo the sort and
  Obsidian's plugin guidelines for the open note are followed (review finding #8).

Other decisions:

- Whole line moves: list marker, task box (`- [ ]` / `- [x]`), title and tags stay with the
  link.
- Same key keeps the old order of those lines (stable sort), so a second run changes nothing.
- No duplicate removal, no line rewriting: the sort only changes the order of lines.

## Technical Details

### Sort key

`sortKey(line: string): string | null` — `null` means "not a link line" (no link in it).

**First link:** the web link or note link that starts first in the line.

**Web link** — steps in this exact order:

1. Find the first match of `URL_RE` with `line.matchAll(URL_RE).next().value` (text + index).
   ⚠️ Never call `URL_RE.exec()` or `URL_RE.test()`: the `g` flag keeps the last position
   between calls, and the next line's link is missed.
2. Cut trailing `. , ; : ! ?` (`TRAILING_PUNCTUATION`).
3. Cut everything from the first `?` or `#`.
4. Drop all trailing slashes (`/\/+$/`, as `normalizeUrl` does).
5. Take the text after the last `/`.
6. Decode `%` codes with `decodeURIComponent`; if it throws (`URIError`, e.g. `100%`), keep the
   text as it is.

**Note link** `[[…]]` (pattern `/\[\[([^\]]+)\]\]/`, no `g` flag):

1. Cut the alias: everything from `|`.
2. Split at `#`: use the part before it; if that part is empty (`[[#Heading]]`, a link to a
   heading in the same note), use the heading text after it.
3. Take the text after the last `/` (folder).

The key keeps its capital letters; the compare ignores them (see Order).

| Line | Key |
| --- | --- |
| `- https://a.com/docs/page?id=2` | `page` |
| `- https://a.com/page#intro` | `page` |
| `- https://a.com/docs/` | `docs` |
| `- https://a.com/docs//` | `docs` |
| `see https://a.com/docs/.` | `docs` |
| `- https://a.com` | `a.com` |
| `- https://www.a.com/` | `www.a.com` |
| `- [Zebra](https://c.com/blog/Alpha)` | `Alpha` |
| `- https://en.wikipedia.org/wiki/Mercury_(planet)` | `Mercury_(planet)` |
| `- https://ru.wikipedia.org/wiki/%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0` | `Москва` |
| `- [[Folder/My Note\|alias]]` | `My Note` |
| `- [[Note#Heading]]` | `Note` |
| `- [[#Heading]]` | `Heading` |
| `- https://a.com/x [[Other]]` | `x` |
| `- [[Other]] https://a.com/x` | `Other` |

`\|` in the table above is only the Markdown table escape. Tests use a plain `|`:
`- [[Folder/My Note|alias]]`.

### Order

`compareKeys(a, b)` = `new Intl.Collator("en", { numeric: true, sensitivity: "base" }).compare`
(one collator, made once). Checked in Deno:

```
-intro | %d0 | 0abc | 2-intro | 2-tips | 10-tips | a.com | alpha | Alpha | éclair | eclair | www.a.com | zeta | Zeta2 | Москва
```

- Digits before letters; numbers by value (`2-tips` before `10-tips`).
- Capital letters ignored (`alpha` = `Alpha`); accents ignored (`é` = `e`). Equal keys keep
  their old order (stable sort).
- Punctuation (`-`, `.`, `%`) before digits. `%` keys are rare: step 6 decodes them.
- Cyrillic and other scripts after Latin.
- `www.` is not removed for links with no path (`https://www.a.com` → `www.a.com`), because the
  rule is "text after the last `/`".

### Note sort

`sortLinkLines(content: string): { content: string; links: number; changed: boolean }`

- Split `content` on `\n`. For each line, keep its ending apart: `\r` if the line ends with it,
  else `""`. Work on the text without `\r`. The ending belongs to the slot, not to the line:
  after sorting, slot *i* gets the sorted text plus slot *i*'s own ending. So a CRLF note
  without a final line break stays exactly that.
- **Frontmatter:** line 1 text is exactly `---`. It ends at the next line whose text is `---` or
  `...`. If it never ends, the whole note counts as frontmatter and nothing moves. A `---` line
  anywhere else is a horizontal rule, not frontmatter.
- **Code block:** a line whose text (leading spaces ignored) starts with 3 or more `` ` `` or
  `~` opens a block; remember the character and the count. Only a line of the same character,
  at least as many, and nothing else after it (spaces allowed) closes it. An unclosed block runs
  to the end of the note.
- **Skipped lines:** outside those blocks, a line whose text (leading spaces ignored) starts
  with `#` followed by a space or the line end (heading), `|` (table row) or `>` (quote,
  callout) is not a link line.
- Every other line with `sortKey(...) !== null` is a link line. (Check `!== null`, not "is
  truthy": a key can be `""`.)
- Stable sort of the link lines by `compareKeys`, write them back into the link-line slots,
  join with `\n`.
- `links` = number of link lines. `changed` = new content differs from the old.

Example. Before (keys: `zeta`, `2-intro`, `alpha`):

```
# Reading
- https://b.com/zeta
Some text
- https://a.com/2-intro
- [Alpha](https://c.com/docs/alpha/)
```

After (ends with a line break, like the input):

```
# Reading
- https://a.com/2-intro
Some text
- [Alpha](https://c.com/docs/alpha/)
- https://b.com/zeta
```

### Command

| Field | Value |
| --- | --- |
| id | `sort-links-in-current-note` |
| name | `Sort links in current note` |
| type | `editorCheckCallback(checking, editor, ctx)` |
| shown when | an editor is active and `ctx.file` is a Markdown note (`isMarkdownNote`) |

Run steps:

1. `before = editor.getValue()`; `result = sortLinkLines(before)`.
2. If `result.changed`: `cursor = editor.getCursor()`, `editor.setValue(result.content)`,
   `editor.setCursor(cursor)`. The line count does not change, so the cursor position is valid.
   If not changed: do not call `setValue` (no undo step, file not marked as changed).
3. Pop-up from the table below. The note name is `ctx.file.basename`.
4. Any error: `console.error("Link Keeper:", err)` and the error pop-up.

| Situation | Pop-up | Shown for | Note changed? |
| --- | --- | --- | --- |
| Lines moved | ✅ Sorted 3 links in “Reading” | 4 seconds | Yes, only line order |
| Already in order, or 0–1 link lines | Links in “Reading” are already in order | 4 seconds | No |
| Something failed | Link Keeper: could not sort the links — see the developer console. | Default | No |

### Known limits (written into SPEC.md, not fixed)

- Each line moves alone. An indented line under a link (sub-item, comment) does not follow its
  parent; an indented link line can move out from under its parent item.
- Indented code blocks (4 spaces, no fence) are not detected; a link inside one can move.
- A link inside inline code (`` `https://…` ``) still counts as a link line.
- Embeds count as links: `![[image.png]]` and `![](https://…/pic.png)` lines move like links.
- The command works in the editor (editing view). In reading view it is hidden or does
  nothing — confirm in the manual check.

## What Goes Where

- **Implementation Steps** (`[ ]` checkboxes): code, tests and doc changes in this repository.
- **Post-Completion** (no checkboxes): manual check in a real Obsidian vault.

## Implementation Steps

### Task 1: Sort key for one line

**Files:**
- Create: `src/sort.ts`
- Modify: `src/links.ts`
- Create: `tests/sort_test.ts`

- [ ] export `URL_RE` and `TRAILING_PUNCTUATION` from `src/links.ts` (no behaviour change)
- [ ] create `src/sort.ts` with `sortKey(line: string): string | null` (no Obsidian imports),
      following the "Sort key" steps in that exact order; read `URL_RE` only through
      `matchAll`
- [ ] write tests for every row of the "Sort key" table (exact key per line), including the
      note-link-first row `- [[Other]] https://a.com/x` → `Other`
- [ ] write tests for edge cases: lines with no link (heading text, plain text, empty line,
      `[[` without `]]`) give `null`; broken `%` code (`https://a.com/100%`) keeps the text;
      shared-regex trap: call `sortKey` on `- https://a.com/very/long/path/to/zeta`, then on
      `- https://b.com/alpha`, and expect `alpha`
- [ ] run `make test` - must pass before task 2 (all existing tests still pass)

### Task 2: Sort the link lines of a note

**Files:**
- Modify: `src/sort.ts`
- Modify: `tests/sort_test.ts`

- [ ] add `compareKeys` (one `Intl.Collator("en", { numeric: true, sensitivity: "base" })`)
- [ ] add `sortLinkLines(content)`: line endings per slot, frontmatter and fence rules,
      skipped lines (heading, table, quote), stable sort, write back into slots; return
      `{ content, links, changed }`
- [ ] write tests for order (named pairs, each fails if its rule breaks):
      - the Before/After example gives the exact After text;
      - digits before letters: `- https://x.com/alpha` above `- https://x.com/2-intro` →
        `2-intro` first;
      - numbers by value: `- https://x.com/10-tips` above `- https://x.com/2-tips` →
        `2-tips` first;
      - capitals ignored: `- https://x.com/Zeta` above `- https://x.com/alpha` → `alpha`
        first;
      - same key keeps old order: `- https://b.com/x` above `- https://a.com/x` → unchanged,
        `changed: false`;
      - task lines `- [ ]` / `- [x]` move whole; note links and web links sort together
- [ ] write tests for blocks and skipped lines (links after each block in reverse order, exact
      full text expected, so a block that swallows the rest of the note fails):
      - frontmatter with `source: https://z.com/zeta` stays byte-for-byte, body links sorted;
      - same in a CRLF note (`\r\n`);
      - a ```` ``` ```` block holding `~~~` and a link stays byte-for-byte;
      - a ```` ```` ```` (4-backtick) block holding ```` ``` ```` and a link stays byte-for-byte;
      - a `---` line in the body (horizontal rule) does not start frontmatter;
      - unclosed frontmatter: note returned unchanged;
      - `## [[Project X]]`, `| [[A]] | b |` and `> see https://a.com/zeta` lines stay in place
        while list links around them get sorted
- [ ] write tests for line endings and small notes:
      - `"# R\r\n- https://x.com/zeta\r\n- https://x.com/alpha"` →
        `"# R\r\n- https://x.com/alpha\r\n- https://x.com/zeta"`;
      - note without a final line break stays without one;
      - empty note and a note with one link: unchanged, `changed: false`, `links` = 0 / 1;
      - sorting twice: the second run returns `changed: false`
- [ ] run `make test` - must pass before task 3

### Task 3: "Sort links in current note" command

**Files:**
- Modify: `src/main.ts`
- Modify: `tests/fake_obsidian.ts`
- Modify: `tests/acceptance_test.ts`

- [ ] fake editor in `tests/fake_obsidian.ts`: add `getValue`, `setValue`, `getCursor`,
      `setCursor`; `setValue` resets the cursor to `{ line: 0, ch: 0 }` (like a real full
      replace) and counts its calls; optional "fail on setValue" switch. Pass
      `ctx = { file }` to `editorCheckCallback`. Add `Harness.runInEditor(commandId, file,
      text, cursor?)` (returns the fake editor) and `Harness.isAvailableInEditor(commandId,
      file)`. Existing `runWithSelection` / `isAvailable` keep working
- [ ] add the command in `src/main.ts` following the "Command" section
- [ ] write acceptance tests (success):
      - `Daily/Reading.md` with the Before text → editor holds the exact After text; full
        notice `{ message: "✅ Sorted 3 links in “Reading”", duration: 4000 }`;
      - cursor at `{ line: 2, ch: 3 }` before → same position after;
      - vault notes (`Links.md` and `Daily/Reading.md`) are not changed by the command
- [ ] write acceptance tests (other cases):
      - already sorted note: `setValue` called 0 times, editor text byte-for-byte the same,
        notice `{ message: "Links in “Reading” are already in order", duration: 4000 }`;
      - hidden with no file (`ctx.file` null) and for `Board.canvas`;
      - error path: `setValue` fails → notice `{ message: "Link Keeper: could not sort the
        links — see the developer console.", duration: undefined }`, editor text unchanged,
        stubbed `console.error` got `"Link Keeper:"` as its first argument
- [ ] confirm the existing "Add selected link" acceptance tests pass with the changed fake
      editor
- [ ] run `make test` - must pass before task 4

### Task 4: Verify acceptance criteria

- [ ] verify all requirements from Overview are implemented
- [ ] verify edge cases are handled (frontmatter, fences, headings/tables/quotes, CRLF, no
      final line break, same key, 0–1 link lines, `[[#Heading]]`, `%` codes)
- [ ] run full test suite: `make test`
- [ ] run `make lint` and `make check`
- [ ] confirm the old add-command tests pass unchanged (adding still appends at the end)

### Task 5: [Final] Update documentation

- [ ] `SPEC.md`: add the command to the "Commands and entry points" table, add a "Sorting
      links" section (key rule, order, which lines move, pop-ups, known limits)
- [ ] `README.md`: one line in the feature list about the sort command
- [ ] write any change made during implementation back into this plan
- [ ] move this plan to `docs/plan/done/`

## Post-Completion

*Items requiring manual intervention or external systems - no checkboxes, informational only*

**Manual verification:**

- In a real Obsidian test vault, open a note with links under two headings, plus a table, a
  callout and a code block with links. Run "Sort links in current note" from the Command
  palette. Check the link order, and that headings, table, callout and code block did not move.
- Press Ctrl/Cmd+Z right after the sort: the old order comes back in one step.
- Cursor stays on the same line number after the sort.
- Switch the note to reading view: check whether the command is hidden (expected for an editor
  command) and write the result into SPEC.md known limits.
- Check on mobile that the command shows in the palette while editing.
