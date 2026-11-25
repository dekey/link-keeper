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
   - lines in the frontmatter (`---` block at the top), a fenced code block, a comment block
     (`%%` … `%%`, `<!--` … `-->`) or a table (a `|` line with a divider line under it, up to
     the next blank line or block start) (comment blocks and tables added in review fix 1,
     table end changed in review fix 2);
   - headings (`#`, `##`, …), table rows (line starts with `|`), quotes and callouts (line
     starts with `>`). Leading spaces and tabs are ignored for this check (as built).
     Underlined headings (text lines with a `===` or `---` line under them) too (review fix 2).
     Footnote definitions (`[^1]: …`) and link reference definitions (`[a]: …`) too (review
     fix 4).
2. **Give each link line a sort key.** The key is the last part of the line's first link: the
   text after the last `/`, up to `?` or `#`.
3. **Sort the link lines** by key in natural order: 0–9 before a–z, numbers by value
   (`2-tips` before `10-tips`), capital letters ignored.
4. **Put them back into the link slots.** All other lines keep their exact places. Link lines
   fill the places where link lines were, in sorted order, so a link can move to another
   section of the note. Each slot keeps its own line ending. List-item link lines (a list
   marker at the start, also tasks) and plain link lines are two groups: each group is sorted
   on its own and fills only the slots of its own kind, so the structure of the note never
   changes (review fix 3, user decision). Each slot keeps its own start and only the rest of
   the line moves (user decision "Marker stays in place"): a list-item slot keeps its leading
   spaces and tabs, list marker and the spaces after it, and the task box moves (review fix
   4); a plain slot keeps its leading spaces and tabs, and the text before the link moves
   (review fix 5).
5. **Write through the editor and tell the user.** The command reads the open editor's text,
   sorts it, and, only when the order changed, replaces just the changed lines in one
   `editor.transaction(…, "link-keeper.sort")` (review fixes 8 and 9; `setValue` replaced the
   whole note). The cursor is put back on the same line (at the line end if that line is now shorter). A
   pop-up says how many links were sorted, or that they were already in order.

Key decisions (from the user):

- Separate command, not sorting on add: adding stays as SPEC.md says ("Nothing else in the
  note moves or changes").
- Current note only: no "sort target note" command.
- All link lines in the whole note sort together, not per block (in a note with both
  list-item and plain link lines: see "Sort each kind apart" below).
- Sort each kind apart (review fix 3, 2026-11-25; replaces "all link lines sort together" for
  notes with both kinds): list-item link lines only fill the places of list-item link lines,
  plain link lines only fill the places of plain link lines. Each kind is sorted by the same
  key and order. Before, a plain line could land above a `---` (and become an underlined
  heading) or right under a table (and become a table row). Notes with only list-item links
  (the default line format `- {link}`) sort exactly as before.
- Marker stays in place (review fix 4, 2026-11-25; replaces "Whole line moves" for list
  items): each list-item slot keeps its own start — leading spaces and tabs, the list marker
  (`- `, `* `, `+ `, `1. `, `1) `) and the spaces after it. Only the rest of the line moves;
  the task box (`[ ]`, `[x]`, any `[?] ` right after the marker) moves with the link. So lists
  keep their 1, 2, 3 numbers, their bullet or number kind and their nesting. The sort key is
  taken from the moved part. Before, `1. 2. 3.` lists came out as `2. 3. 1.`, and numbered
  lines could land in bullet lists. Plain slots keep their own start too: their leading
  spaces and tabs (review fix 5, 2026-11-25, the same rule; the earlier wording "Plain link
  lines still move whole" was the orchestrator's, not the user's choice). Before, a plain
  line took its indent with it: at the left edge (under a heading, after a blank line) a tab
  or 4+ spaces turned it into an indented code block, and the line that came back into the
  list place lost its indent, so it left the list item or split the list. Plain lines still
  only fill plain slots ("Sort each kind apart" stays).
- Sort key: last part of the link, up to `?`; order 0–9, then a–z (natural order).
- Headings, tables, quotes and callouts never move (review finding #4). Footnote definitions
  and link reference definitions never move either (review fix 4; follows the rule that the
  structure of the note never changes).
- Write through the Editor API, not `vault.process`, so Ctrl/Cmd+Z can undo the sort and
  Obsidian's plugin guidelines for the open note are followed (review finding #8).

Other decisions:

- What moves: each link line moves without its start (see "Marker stays in place"): a
  list-item line without its leading spaces, marker and the spaces after it, a plain line
  without its leading spaces and tabs. Task box, text before the link, title and tags stay
  with the link.
- Same key keeps the old order of those lines (stable sort), so a second run changes nothing.
- No duplicate removal, no rewriting of the moved text: the sort only changes where it is.

## Technical Details

### Sort key

`sortKey(line: string): string | null` — `null` means "not a link line" (no link in it).

**First link:** the web link or note link that starts first in the line.

**Web link** — steps in this exact order:

1. Find the first match with `FIRST_URL_RE.exec(line)` (text + index). `FIRST_URL_RE` is
   `new RegExp(URL_RE.source, URL_RE.flags.replace("g", ""))`: an own copy with the same flags
   but without `g`, so it keeps no position between lines (review fix 1; `matchAll` on the
   shared `URL_RE` started at its `lastIndex`; flags read from `URL_RE` since the smells review).
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
   heading in the same note), the key is the whole heading text after it (no step 3, so
   `[[#Q&A / Notes]]` → `Q&A / Notes`).
3. Take the text after the last `/` of the note name (folder).

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

- A byte order mark `\uFEFF` at the very start of the note is set aside first and put back in
  front of the result, so it never moves with line 1 (review fix 2).
- Split `content` on `\n`. For each line, keep its ending apart: `\r` if the line ends with it,
  else `""`. Work on the text without `\r`. The ending belongs to the slot, not to the line:
  after sorting, slot *i* gets the sorted text plus slot *i*'s own ending. So a CRLF note
  without a final line break stays exactly that.
- **Frontmatter:** line 1 text is exactly `---` (after the byte order mark is set aside, so
  frontmatter after one is found). It ends at the next line whose text is exactly `---`, as Obsidian's
  `getFrontMatterInfo` reads it (a `...` line does not end it). A `---` first line with no
  closing `---` is a horizontal rule, not frontmatter, and so is a `---` line anywhere else
  (review fix 9; before, `...` ended it and an unclosed block froze the whole note).
- **Code block:** a line whose text (leading spaces and tabs and one list marker `- `, `* `,
  `+ `, `1. `, `1) ` ignored) starts with 3 or more `` ` `` or `~` opens a block; remember the
  character and the count. A backtick run with another backtick after it on the line
  (```` ```a``` text ````) is inline code, not a fence. Only a line of the same character, at
  least as many, and nothing else on it (spaces and tabs allowed before and after) closes it.
  An unclosed block runs to the end of the note.
- **Comment block:** a line with an odd number of `%%` opens an Obsidian comment; the next
  line with an odd number of `%%` closes it. A line where `<!--` starts and no `-->` follows
  opens an HTML comment; the next line holding `-->` closes it, unless a new `<!--` opens after
  it on that line (`--> <!--`, review fix 2). All lines from the opening to
  the closing line stay. An unclosed comment runs to the end of the note.
- **Table:** a line holding `|` whose next line is a divider (only spaces, `|`, `:` and `-`,
  with at least one `|` and one `-`) starts a table. Rows without `|` stay in it. The table
  ends before the first line after the divider that (leading spaces and tabs ignored) is blank
  or starts another block: a list marker (`- `, `* `, `+ `, `1. `, `1) `), a heading, `>`, a
  fence or a line that opens a comment block (review fix 2; before, it ran to the next blank
  line, so a list right under a table never sorted).
- **Underlined heading:** a run of text lines (not blank, not starting a list item, heading,
  quote, fence or comment) with a line of only `=` or only `-` right under it (up to 3 spaces
  before it) is a heading; none of its lines is a link line. A `---` under a list item or a
  blank line is a divider (review fix 2). Found in one pass from the end of the note, so a long
  note of plain link lines stays fast.
- **Skipped lines:** outside those blocks (frontmatter, code, comment, table), a line whose
  text (leading spaces and tabs ignored) starts with 1 to 6 `#` followed by a space, a tab or
  the line end (heading), `|` (table row), `>` (quote, callout) or `[label]:` (footnote
  definition `[^1]:` or link reference definition `[a]:`, `DEFINITION_RE`, review fix 4) is
  not a link line. As built: `#tag https://…` and `####### https://…` are link lines, not
  headings.
- Every other line with `sortKey(...) !== null` is a link line. (Check `!== null`, not "is
  truthy": a key can be `""`.)
- **Two kinds of link lines** (review fix 3): a link line whose text (leading spaces and tabs
  ignored) starts with a list marker (`- `, `* `, `+ `, `1. `, `1) `, so also tasks `- [ ]`;
  since review fix 4 found with `LIST_START_RE`, before with `LIST_MARKER_RE` on the trimmed
  text, same lines) is a list-item link line; every other link line is a plain link line.
- **List-item start** (review fix 4): `LIST_START_RE` (`/^\s*(?:[-*+]|\d+[.)])[ \t]+/`) cuts a
  list-item link line into its start (leading spaces and tabs, marker, spaces after it) and
  the rest. The start belongs to the slot and stays; the rest (task box, link, title, tags)
  moves, and the sort key is taken from it.
- **Plain start** (review fix 5): `PLAIN_START_RE` (`/^[ \t]*/`) cuts a plain link line the
  same way into its start (leading spaces and tabs) and the rest; the start stays with the
  slot. The kind (list item or plain) comes from whether `LIST_START_RE` matched, not from the
  start being empty: an indented plain line has a start too.
- Stable sort of each kind by `compareKeys`; write each kind back only into the slots of its
  own kind (list-item lines into list-item slots, plain lines into plain slots): slot *i* gets
  its own start + the sorted rest + its own line ending. Join with `\n`.
- `links` = number of link lines of both kinds. `changed` = new content differs from the old.

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
2. If `result.changed`: `cursor = editor.getCursor()`,
   `editor.transaction({ changes: lineChanges(before, result.content) }, "link-keeper.sort")`
   (one change per changed line, one undo step that never merges with typing before it),
   then `editor.setCursor({ line: cursor.line, ch: Math.min(cursor.ch, lineEnd) })` with
   `lineEnd = editor.getLine(cursor.line).length`.
   The line count does not change, so the line exists; its text may be shorter now, and
   Obsidian's `setCursor` does not limit `ch` to the line (it lands on a later line, or throws
   past the end of the note), so `ch` is limited here (review fix 1). A selection is not kept.
   If not changed: no transaction (no undo step, file not marked as changed).
3. Pop-up from the table below. The note name is `ctx.file.basename`. The count is
   `result.links`: all link lines in the note, also those that did not move (as built).
4. Any error: `console.error("Link Keeper:", err)` and the error pop-up.

| Situation | Pop-up | Shown for | Note changed? |
| --- | --- | --- | --- |
| Lines moved | ✅ Sorted 3 links in “Reading” | 4 seconds | Yes, only the order of links |
| Already in order, or 0–1 link lines | Links in “Reading” are already in order | 4 seconds | No |
| Something failed | Link Keeper: could not sort the links — see the developer console. | Default | No |

### Known limits (written into SPEC.md, not fixed)

- Each link moves alone. A line under a link (sub-item, note) does not follow it. Each slot
  keeps its indent (list slots since review fix 4, plain slots since review fix 5), so the
  shape of the note stays, but a link from a sub-item or from an indented line inside a list
  item can move to a top slot and the other way round.
- Indented code blocks (4 spaces, no fence) are not detected: the text of a link line inside
  one can move out, and another link can move in and show as code.
- A link inside inline code (`` `https://…` ``) still counts as a link line.
- Embeds count as links: `![[image.png]]` and `![](https://…/pic.png)` lines move like links.
- The command works only in the editor (editing view). Obsidian hides it in reading view and
  while the focus is in the note's properties (read in the Obsidian 1.15.1 app code: editor
  commands without `allowPreview` / `allowProperties` are skipped there).
- ➕ (review fix 1, widened in review fix 2) `%%` or `<!--` inside inline code (`` `%%` ``) or
  inside the other kind of comment (`<!-- %% -->`) still opens a comment block, so the lines
  below it do not move until the next unpaired `%%` or `-->`.
- ➕ (review fix 2) Math blocks (`$$`) and HTML blocks (`<div>`) are not detected; a link line
  inside one can move.
- ➕ (review fix 2) A line of only fence characters closes a code block even when it is
  indented by 4 or more spaces, where Markdown can still count it as code.
- ➕ (review fix 2) A text line right under a quote or callout, without `>`, can belong to it in
  Markdown (a "lazy" line); here it is a normal line, so its link can move.
- ➕ (review fix 4) The same for a text line right under a footnote definition: it can belong
  to the footnote; here it is a normal plain line, so its link can move out and another plain
  link line can move in.
- ➕ (review fix 1) Markdown links to notes (`[Alpha](Alpha.md)`, used when "Use [[Wikilinks]]"
  is off) are not link lines: they stay while the other links sort around them.

### Changes made during implementation

Written back in Task 5; the text above is updated to match the code.

- Heading = 1 to 6 `#`, then a space, a tab or the line end (Task 2). The first plan text
  ("`#` followed by a space") would let `## [[Project X]]` move.
- "Leading spaces ignored" also ignores tabs (`trimStart()`), for fences and for the heading,
  table and quote check; a closing fence may have spaces or tabs before and after (Task 2).
- Unclosed frontmatter returns `links: 0`, `changed: false` (Task 2).
- The "Sorted *n* links" pop-up counts all link lines in the note, also those that did not
  move (Task 3).
- `Harness.runInEditor` takes `{ cursor?, failOnSetValue? }` as its 4th argument (Task 3; see
  the Task 3 note below).
- Review fix 1 (code review findings, see `logs/20261125-fix1.md`):
  - Cursor: `ch` is limited to the length of the cursor's line after the sort; the fake
    `setCursor` now counts `ch` from the line start and throws past the end, like Obsidian.
  - New blocks that never move: `%%` and `<!-- -->` comment blocks, tables with a divider line
    (also without outer `|`, up to the next blank line), code blocks that start after a list
    marker (```` - ``` ````). A backtick run with a backtick after it is inline code, not a fence.
    Frontmatter after a byte order mark is found.
  - Sort key: own `FIRST_URL_RE` (no `g` flag) instead of `matchAll` on the shared `URL_RE`;
    `[[#Heading]]` keeps the whole heading text (no folder step).
  - Block detection moved into one `blockEnd(texts, i)` helper (frontmatter, code, comment,
    table); `Harness.isAvailableInEditor` removed (`isAvailable` with `activeFile` does the
    same).
- Review fix 2 (code review findings, see `logs/20261125-fix2.md`):
  - A table ends before the first blank line or block start (list item, heading, quote, fence,
    comment) after its divider, not at the next blank line only. The divider itself always
    belongs to the table.
  - An HTML comment is not closed by a `--> <!--` line (it closes and opens again).
  - Underlined headings (`===` / `---` under text lines) never move; the "only `#` headings"
    known limit is gone (the user decision says headings never move).
  - A byte order mark at the start stays at the start instead of moving with line 1.
- Review fix 3 (code review finding, user decision "Sort each kind apart", see
  `logs/20261125-fix3.md`):
  - List-item link lines and plain link lines sort as two groups; each group fills only its
    own slots. Before, all link lines filled all slots, so a plain line could move above a
    `---` (it became an underlined heading and the divider was gone) or right under a table
    (it became a table row); a second sort then found fewer links. Notes with only list-item
    links sort as before. The pop-up count is still all link lines.
- Review fix 4 (code review findings, user decision "Marker stays in place", see
  `logs/20261125-fix4.md`):
  - Each list-item slot keeps its own start (leading spaces and tabs, list marker, spaces
    after it); only the rest of the line moves, task box included. Before, the whole line
    moved: `1. 2. 3.` lists came out as `2. 3. 1.` (Obsidian's reading view then numbers them
    from 2), a numbered item not starting at 1 under a text line dropped out of the list, and
    numbered lines landed in bullet lists. Nesting now stays with the slot.
  - Footnote definitions (`[^1]: …`) and link reference definitions (`[a]: …`) never move.
    Before, they were plain link lines: a footnote could move into the body and a body link
    line could land right under a footnote (and become part of its text).
  - The "Lines moved" pop-up row says "only the order of links" (a list-item line can now get
    another marker, so "only line order" was no longer exact).
- Review fix 5 (code review finding, the user decision "Marker stays in place" applied to
  plain slots, see `logs/20261125-fix5.md`):
  - Each plain slot keeps its own leading spaces and tabs (`PLAIN_START_RE`); only the rest
    of the line moves. Before, a plain line moved whole with its indent: a line from inside a
    list item (a tab or 4+ spaces) that landed under a heading or after a blank line became an
    indented code block (the link could not be clicked), and the line that came back into the
    list place lost its indent, so it left the list item or split the list. The kind of a link
    line comes from the list marker match, not from an empty start.
- Review fix 6 (code review of the local changes after the plan run, see
  `logs/20261125-review2.md`):
  - An underline indented inside a list item (4+ spaces or a tab) is found, so the text lines
    of that heading never move. A list item is part of the heading when the underline is
    indented more than the item.
  - A table ends at a divider line (`---`, `***`, `___`). Before, the table ran on through
    the divider, so the links after it never sorted and the pop-up said "already in order".
  - The line right above a table divider never moves. Before, a moved `[[Note|alias]]`
    could land there and turn the two lines into a table.
- Review fix 7 (second code review of the local changes, see `logs/20261125-review3.md`):
  - A numbered line that does not start at 1 (`2. …`) under a text line is part of that
    text, so it belongs to an underlined heading too.
  - Any non-blank line with a table divider under it starts a table (`Links` over `|---|`);
    this replaces the fix 6 "line above a divider" check.
  - Lines in a block (table, code, comment, frontmatter) end the underlined heading check, and
    a one-line `<!-- … -->` starts a block for it and ends a table. Before, a `---` under a
    table made the link line above the table count as heading text.
  - A stray `%%` (`100%%`, inside a link) is listed in SPEC "Known limits", not fixed.
- Review fix 8 (third code review of the local changes, see `logs/20261125-review4.md`):
  - The command writes with `editor.transaction`, one change per changed line, instead of
    `editor.setValue` (which replaces the whole note, so folds were lost; read in the Obsidian
    app code). New pure helper `lineChanges` in `src/sort.ts`.
  - Lines that start with an HTML comment never move.
  - A `2. …` line is heading text only when it goes on with a text line above it (or with the
    text of a list item it is indented into); a numbered list above `---` gets sorted again.
  - A list item belongs to an underlined heading only when the underline is indented at least
    as far as the item's text.
  - `<!-->` and `<!--->` end in their own line.
- Review fix 9 (fourth code review of the local changes, see `logs/20261125-review5.md`):
  - Frontmatter as Obsidian reads it: it ends only at an exact `---` line; a `---` first
    line with no closing `---` is a divider (read in the Obsidian app code).
  - The editor transaction gets the origin `"link-keeper.sort"`, so Obsidian's undo history
    never merges the sort with typing done just before it.
  - Bold, italic and strike-through marks glued to a bare link are not part of its key.
  - An underline indented 4 or more columns past the heading text is plain text.
- Review fix 10 (fifth code review of the local changes, see `logs/20261125-review6.md`):
  - A Markdown link with a web address in its title sorts by the address it opens
    (`firstWebLink`).
  - A fence after several list markers (`- 1. ```) is found; a fence opened after a list
    marker also ends where the list item ends.
  - A line indented 4+ columns past the paragraph start goes on with the paragraph, so it does
    not end an underlined heading's text (`textLines`).
  - A link line inside a wrapped paragraph is a SPEC "Known limits" item, not fixed.

## What Goes Where

- **Implementation Steps** (`[ ]` checkboxes): code, tests and doc changes in this repository.
- **Post-Completion** (no checkboxes): manual check in a real Obsidian vault.

## Implementation Steps

### Task 1: Sort key for one line

**Files:**
- Create: `src/sort.ts`
- Modify: `src/links.ts`
- Create: `tests/sort_test.ts`

- [x] export `URL_RE` and `TRAILING_PUNCTUATION` from `src/links.ts` (no behaviour change)
- [x] create `src/sort.ts` with `sortKey(line: string): string | null` (no Obsidian imports),
      following the "Sort key" steps in that exact order; read `URL_RE` only through
      `matchAll`
- [x] write tests for every row of the "Sort key" table (exact key per line), including the
      note-link-first row `- [[Other]] https://a.com/x` → `Other`
- [x] write tests for edge cases: lines with no link (heading text, plain text, empty line,
      `[[` without `]]`) give `null`; broken `%` code (`https://a.com/100%`) keeps the text;
      shared-regex trap: call `sortKey` on `- https://a.com/very/long/path/to/zeta`, then on
      `- https://b.com/alpha`, and expect `alpha`
- [x] run `make test` - must pass before task 2 (all existing tests still pass)

### Task 2: Sort the link lines of a note

**Files:**
- Modify: `src/sort.ts`
- Modify: `tests/sort_test.ts`

- [x] add `compareKeys` (one `Intl.Collator("en", { numeric: true, sensitivity: "base" })`)
- [x] add `sortLinkLines(content)`: line endings per slot, frontmatter and fence rules,
      skipped lines (heading, table, quote), stable sort, write back into slots; return
      `{ content, links, changed }`
- [x] write tests for order (named pairs, each fails if its rule breaks):
      - the Before/After example gives the exact After text;
      - digits before letters: `- https://x.com/alpha` above `- https://x.com/2-intro` →
        `2-intro` first;
      - numbers by value: `- https://x.com/10-tips` above `- https://x.com/2-tips` →
        `2-tips` first;
      - capitals ignored: `- https://x.com/Zeta` above `- https://x.com/alpha` → `alpha`
        first;
      - same key keeps old order: `- https://b.com/x` above `- https://a.com/x` → unchanged,
        `changed: false`;
      - task lines `- [ ]` / `- [x]` move whole (review fix 4: the task box moves with the
        link, the list marker stays in its slot); note links and web links sort together
- [x] write tests for blocks and skipped lines (links after each block in reverse order, exact
      full text expected, so a block that swallows the rest of the note fails):
      - frontmatter with `source: https://z.com/zeta` stays byte-for-byte, body links sorted;
      - same in a CRLF note (`\r\n`);
      - a ```` ``` ```` block holding `~~~` and a link stays byte-for-byte;
      - a ```` ```` ```` (4-backtick) block holding ```` ``` ```` and a link stays byte-for-byte;
      - a `---` line in the body (horizontal rule) does not start frontmatter;
      - unclosed frontmatter: note returned unchanged;
      - `## [[Project X]]`, `| [[A]] | b |` and `> see https://a.com/zeta` lines stay in place
        while list links around them get sorted
- [x] write tests for line endings and small notes:
      - `"# R\r\n- https://x.com/zeta\r\n- https://x.com/alpha"` →
        `"# R\r\n- https://x.com/alpha\r\n- https://x.com/zeta"`;
      - note without a final line break stays without one;
      - empty note and a note with one link: unchanged, `changed: false`, `links` = 0 / 1;
      - sorting twice: the second run returns `changed: false`
- [x] run `make test` - must pass before task 3

### Task 3: "Sort links in current note" command

**Files:**
- Modify: `src/main.ts`
- Modify: `tests/fake_obsidian.ts`
- Modify: `tests/acceptance_test.ts`

- [x] fake editor in `tests/fake_obsidian.ts`: add `getValue`, `setValue`, `getCursor`,
      `setCursor`; `setValue` resets the cursor to `{ line: 0, ch: 0 }` (like a real full
      replace) and counts its calls; optional "fail on setValue" switch. Pass
      `ctx = { file }` to `editorCheckCallback`. Add `Harness.runInEditor(commandId, file,
      text, cursor?)` (returns the fake editor) and `Harness.isAvailableInEditor(commandId,
      file)`. Existing `runWithSelection` / `isAvailable` keep working
      (done as `runInEditor(commandId, file, text, { cursor?, failOnSetValue? })`: the fail
      switch must be set before the command runs; `setValue` keeps every text it got in
      `setValueCalls`, so its length is the call count)
- [x] add the command in `src/main.ts` following the "Command" section
- [x] write acceptance tests (success):
      - `Daily/Reading.md` with the Before text → editor holds the exact After text; full
        notice `{ message: "✅ Sorted 3 links in “Reading”", duration: 4000 }`;
      - cursor at `{ line: 2, ch: 3 }` before → same position after;
      - vault notes (`Links.md` and `Daily/Reading.md`) are not changed by the command
- [x] write acceptance tests (other cases):
      - already sorted note: `setValue` called 0 times, editor text byte-for-byte the same,
        notice `{ message: "Links in “Reading” are already in order", duration: 4000 }`;
      - hidden with no file (`ctx.file` null) and for `Board.canvas`;
      - error path: `setValue` fails → notice `{ message: "Link Keeper: could not sort the
        links — see the developer console.", duration: undefined }`, editor text unchanged,
        stubbed `console.error` got `"Link Keeper:"` as its first argument
- [x] confirm the existing "Add selected link" acceptance tests pass with the changed fake
      editor
- [x] run `make test` - must pass before task 4

### Task 4: Verify acceptance criteria

- [x] verify all requirements from Overview are implemented
- [x] verify edge cases are handled (frontmatter, fences, headings/tables/quotes, CRLF, no
      final line break, same key, 0–1 link lines, `[[#Heading]]`, `%` codes)
      (no gap against the plan; 31 rule breaks tried in a scratch copy, each one fails a
      named test; two limits outside the plan's rules added to "Known limits" with ➕)
- [x] run full test suite: `make test`
- [x] run `make lint` and `make check`
- [x] confirm the old add-command tests pass unchanged (adding still appends at the end)

### Task 5: [Final] Update documentation

- [x] `SPEC.md`: add the command to the "Commands and entry points" table, add a "Sorting
      links" section (key rule, order, which lines move, pop-ups, known limits)
      (also fixed the "one of three commands" sentence: now four commands)
- [x] `README.md`: one line in the feature list about the sort command
- [x] write any change made during implementation back into this plan
      (see "Changes made during implementation" under Technical Details)
- [x] move this plan to `docs/plan/done/` (skipped - the harness moves the plan after all
      phases finish)

## Post-Completion

*Items requiring manual intervention or external systems - no checkboxes, informational only*

**Manual verification:**

- In a real Obsidian test vault, open a note with links under two headings, plus a table, a
  callout and a code block with links. Run "Sort links in current note" from the Command
  palette. Check the link order, and that headings, table, callout and code block did not move.
- Press Ctrl/Cmd+Z right after the sort: the old order comes back in one step.
- Cursor stays on the same line number after the sort.
- Switch the note to reading view: check that the command is hidden (SPEC.md known limits say
  so, from the Obsidian 1.15.1 app code).
- Check on mobile that the command shows in the palette while editing.
