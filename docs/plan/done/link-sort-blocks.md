# Sort blocks of link lines

## Overview

- "Sort links in current note" (PR #2, branch `link-sort`) is too complicated now. It sorts
  every line that holds a link (web or note link, also inside text) across the whole note,
  and needs a Markdown block parser (tables, underlined headings, definitions, paragraph
  rules) to keep the note's structure safe. `src/sort.ts` is 488 lines, and SPEC lists 11
  known limits.
- New rule, as the owner asked: **read the note from top to bottom; sort one block of link
  lines, then go to the next block and sort it, until the end of the note.**
  - A **link line** holds one web link and nothing else. In front of the link the line may
    have spaces, a list marker (`- `, `* `, `+ `, `1. `, `2) `) and a task box (`[ ]`).
  - A **block** is link lines right under each other.
  - Every other line stays where it is.
- This replaces the first plan's "All link lines, whole note" and the per-list plan (A+,
  dropped as too complicated). The per-list plan is not kept in the repo: it was dropped
  before any code was written; its design is in `logs/20261125-plan2.md`. The sort key and
  order, the command, the pop-ups and the editor write (`editor.transaction`, one undo step)
  stay as they are.
- Also in this plan: the small fixes the owner picked from the PR #2 review: no shared `g`
  regex exported from `src/links.ts`, and `ssh -G --` in `scripts/release.sh`.

## Context (from discovery)

- Branch `link-sort` = PR #2 head (`78a0ecb`). The owner's uncommitted `Makefile` change
  (removes the `zip` target) is not part of this plan (see Post-Completion).
- `src/sort.ts` (488 lines):
  - keep `webLinkKey` (last part after `/`, no query/anchor/end slashes, `%` decoded),
    `compareKeys` (natural order), `lineChanges`, `sortLinkLines(content)` signature, the byte
    order mark and per-line `\r` handling, `openingFence` / `closesFence`;
  - remove note links (`NOTE_LINK_RE`, `noteLinkKey`), Markdown link titles
    (`MARKDOWN_LINK_RE`, `firstWebLink`), emphasis marks (`TRAILING_EMPHASIS`, `trimLinkEnd`),
    and all block rules (from `togglesComment` to the two-group fill in `sortLinkLines`).
- `src/main.ts`: uses `sortLinkLines(before)` → `{ content, links, changed }` and
  `lineChanges`; no change needed.
- `src/links.ts:11` exports `URL_RE` with the `g` flag (`containsLink` needs `g`; `sort.ts:7`
  makes a copy without it; `tests/sort_test.ts:156-167` guards `lastIndex`).
- Tests:
  - `tests/sort_test.ts`: 118 rule tests; most test block rules and note/Markdown links,
    which go away;
  - `tests/acceptance_test.ts`: the sort tests use the `BEFORE`/`AFTER` fixture (SPEC "Order"
    example), `SORT_CHANGES`, `SORT_STEP` and the cursor tests.

  Under the new rule the fixture has no block of two or more link lines (`Some text` and the
  Markdown link line split it), so it must change.
- Docs:
  - `SPEC.md` "Sorting links" (about 1,300 words; rewritten short);
  - `README.md` feature line (13) and Use table row (129);
  - `docs/plan/done/link-sort.md` (first plan).

## Development Approach

- **testing approach**: Regular (code first, then tests), as the owner chose.
- complete each task fully before moving to the next; small, focused changes
- **every task includes new/updated tests**. They assert exact values (full note in, full note
  out, exact `links`/`changed`), are named after the rule, and fail when the rule breaks.
  Break each rule once on purpose in a scratch copy under `/tmp`, and note it in the task log.
- **all tests must pass before the next task** (`make test`, `make lint`)
- **update this plan when scope changes**
- **No commits.** Work stays uncommitted on branch `link-sort` (AGENTS.md: "NEVER COMMIT
  WITHOUT MY APPROVAL!"). Skills or subagents that say "commit" drop that step.
- Task logs: `docs/plan/logs/20261125-blk-t1.md` … `20261125-blk-t5.md` (new names, so the
  first plan's logs are not overwritten). Add each to the index
  `docs/plan/logs/link-sort-blocks.md` right away.
- Do not touch the owner's `Makefile` change.

## Testing Strategy

- **unit tests**: `tests/sort_test.ts`, one test per rule in Technical Details.
- **acceptance tests**: `tests/acceptance_test.ts` through the built bundle (exact editor
  changes, origin, cursor, pop-ups). No UI e2e tests exist in this project.
- **random check** (scratch, not committed): on 50k random notes, check that:
  - only link lines change;
  - every block holds the same set of links before and after;
  - sorting twice changes nothing;
  - applying `lineChanges` to the old text gives the sorted text.

## Progress Tracking

- mark completed items with `[x]` immediately when done
- add newly discovered tasks with ➕ prefix
- document issues/blockers with ⚠️ prefix
- keep plan in sync with actual work done

## Solution Overview

- One pass over the lines:
  - skip the frontmatter and fenced code blocks;
  - collect each run of link lines into a block;
  - sort the block;
  - write each sorted link back into the block's places.
- A place keeps its start (indent + list marker); only the task box and the link move. So
  `1.` `2.` `3.` stay in order, and indents and bullets stay.
- A block holds either only lines with a list marker or only lines without one (rule 2), and
  a task box needs a list marker (rule 1). So only lines of the same shape swap places, and
  only inside a block: no heading, table, paragraph or list changes its type, no task box
  lands on a line without a marker, and the old block parser is not needed.

## Technical Details

### Rules

1. **Link line**: the line is, in this order:
   - optional spaces/tabs;
   - an optional list marker (`-`, `*`, `+`, or a number with `.` or `)`), then one or more
     spaces/tabs;
   - only after a list marker: an optional task box (`[ ]`, `[x]`, `[X]`), then one or more
     spaces/tabs;
   - exactly one web link (`http://` or `https://`, matched by `URL_RE` with its flags, so
     capital letters count);
   - nothing else, apart from spaces or tabs at the end.

   | Line | Link line? |
   | --- | --- |
   | `https://github.com/dekey/link-keeper` | yes |
   | `- https://github.com/dekey/link-keeper/pull/2` | yes |
   | `12. https://a.com/x` | yes |
   | `+ https://a.com/x` | yes |
   | `\t- [ ]  https://a.com/x` | yes |
   | `- [X] https://a.com/x` | yes |
   | `-   https://a.com/x` | yes (several spaces after the marker) |
   | `-\thttps://a.com/x` | yes (a tab after the marker) |
   | `HTTPS://A.COM/x` | yes (capital letters) |
   | `-https://a.com/x` | no (no space after the marker) |
   | `*https://a.com/x*` | no (no space after the `*`: italic text) |
   | `- [ ]https://a.com/x` | no (no space after the task box) |
   | `See https://a.com/x` | no (text before) |
   | `- https://a.com/x nice` | no (text after) |
   | `- https://a.com/x https://b.com/y` | no (two links) |
   | `- [title](https://a.com/x)` | no (Markdown link) |
   | `- [[Note]]` | no (note link) |
   | `> https://a.com/x`, `# https://a.com/x` | no (quote, heading) |
   | `- 2. https://a.com/x` | no (two list markers) |
   | `[ ] https://a.com/x` | no (task box without a list marker) |
   | `- [-] https://a.com/x` | no (only `[ ]`, `[x]`, `[X]` count as a task box) |
   | `- <https://a.com/x>` | no (link in angle brackets) |

2. **Block**: one or more link lines right under each other. Any other line ends a block: a
   blank line, text, a heading, a line with a link and text. A block also ends where a line
   with a list marker follows a line without one, or the other way round (`https://a.com/z`
   then `- https://a.com/a` are two blocks).
3. **Sort**: each block on its own, stable, by the key of its link with `compareKeys` (0–9, then
   a–z, numbers by value, capitals and accents ignored). The key is the text after the last
   `/`, without query (`?…`) and anchor (`#…`), then without slashes and punctuation at the
   end (so `docs.?x=1` → `docs`), with `%` codes decoded; a link with no path is sorted by its domain. Examples:
   `https://github.com/dekey/link-keeper/pull/2` → `2`,
   `https://github.com/dekey/link-keeper` → `link-keeper`.
4. **What moves**: each place keeps its start (indent + list marker) and its end (spaces or
   tabs at the line end); the rest (task box + link) moves. Each line keeps its own line ending (`\r`); the byte order mark stays first.
5. **Never touched**:
   - the frontmatter, as Obsidian reads it: a `---` first line up to the next exact `---`
     line (a `...` line does not end it). A `---` first line with no closing `---` is not
     frontmatter: it is a normal line, and the link lines below it are sorted;
   - fenced code blocks: a line that starts with 3+ `` ` `` or `~` (after optional spaces and
     list markers, as in `- ``` ` and `- 1. ``` `), not followed by a backtick on the same
     line for a backtick fence (so ```` ```a``` ```` is not a fence), up to a line with only
     the same character, at least as many. An unclosed block runs to the end of the note.
     The old rule "a fence after a list marker ends where the list item ends" is removed on
     purpose (simpler; the old test for it goes away).

   Lines inside them are not link lines and end a block.
6. **Count** (*n* in "✅ Sorted *n* links"): all link lines in the note, also blocks of one
   line and lines that did not move. "Already in order" when nothing changed (as now).

### Code layout (`src/sort.ts`, about 100 lines)

- `LINK_LINE_RE`: `^(start)(rest)(end)$`; the end is the spaces/tabs at the line end. The start is the indent + an optional list marker
  with its spaces; the rest is an optional task box (only after a marker) + the link. It is
  built from `URL_RE.source` with `URL_RE.flags` (case-insensitive).
- `linkLine(text) → { start, rest, end, key, marked } | null`: the one function that decides
  "link line" and its key. `marked` = has a list marker. The walk and the tests both use it.
- `webLinkKey(url)` (kept; since review fix r1 it cuts the query and anchor first, then the
  slashes and punctuation at the end), `compareKeys` (kept).
- `skippedLines(texts)`: marks the frontmatter and fenced code lines (uses `openingFence` /
  `closesFence`).
- `sortLinkLines(content)`:
  1. split the lines; set `\r` and the byte order mark aside;
  2. walk the lines and collect each block of link lines as `{ line, start, rest, end, key }`
     (a skipped line, a non-link line or a change of `marked` ends a block);
  3. sort each block stably by key;
  4. write `start + rest + end` back into the block's places;
  5. join and return `{ content, links, changed }`.
- `lineChanges` (kept).
- `sortKey(line)` export: used only by tests today. It is replaced by `linkLine`; the key
  tests call `linkLine(line)?.key`.

### Minor review fixes

- `src/links.ts`: export `URL_RE` **without** `g` (comment: one link per `exec`, no position
  kept); a private global copy for `containsLink`. `sort.ts` uses `URL_RE` directly; the
  `lastIndex` test and the `URL_RE` import in `tests/sort_test.ts` go away.
- `scripts/release.sh` `github_repo`: `ssh -G -- "${BASH_REMATCH[1]}"`.

## What Goes Where

- **Implementation Steps** (`[ ]` checkboxes): code, tests, SPEC/README, logs.
- **Post-Completion** (no checkboxes): checks in a real vault, the owner's `Makefile` change vs
  `release.sh`, the PR #2 description.

## Implementation Steps

### Task 1: URL pattern without a shared `g` flag

**Files:**
- Modify: `src/links.ts`, `src/sort.ts` (drop `FIRST_URL_RE`)
- Modify: `tests/links_test.ts`, `tests/sort_test.ts`

- [x] `src/links.ts`: `URL_RE` without `g`, a private global copy for `containsLink`; update
      the comment
- [x] `src/sort.ts`: use `URL_RE` instead of `FIRST_URL_RE`
- [x] tests: add "containsLink finds the link when it is the second web address in the note"
      (`"- https://a.com/x\n- https://b.com/y\n"`, `https://b.com/y` → true); delete the
      `lastIndex` test and the `URL_RE` import in `tests/sort_test.ts`
- [x] break once: drop `g` from the private copy → the new test fails
- [x] `make test`, `make lint` pass; write `20261125-blk-t1.md`

### Task 2: Sort blocks of link lines

**Files:**
- Modify: `src/sort.ts`
- Modify: `tests/sort_test.ts`, `tests/acceptance_test.ts`
- Modify: `SPEC.md` ("Sorting links": behaviour changes here, so the SPEC changes here)

**Shared example** (used in SPEC and as the acceptance `BEFORE`/`AFTER`):

| Before | After |
| --- | --- |
| `# Reading` | `# Reading` |
| `- https://b.com/zeta` | `- https://a.com/2-intro` |
| `- https://a.com/2-intro` | `- https://b.com/zeta` |
| `Some text` | `Some text` |
| `1. https://github.com/dekey/link-keeper` | `1. [ ] https://github.com/dekey/link-keeper/pull/2` |
| `2. [ ] https://github.com/dekey/link-keeper/pull/2` | `2. https://github.com/dekey/link-keeper` |

Two blocks split by a text line; numbers stay; the task box moves with its link; keys `2`
before `link-keeper`; *n* = 4.

- [x] `src/sort.ts`:
  - add `LINK_LINE_RE`, `linkLine`, `skippedLines` and the block walk in `sortLinkLines`
    (Code layout);
  - remove `sortKey`, note links, Markdown link titles, emphasis marks and all old block rules
    (keep `webLinkKey`, `compareKeys`, `lineChanges`, `openingFence`, `closesFence`);
  - update the doc comments and the `links` doc of `SortResult`.
  - note (done in Task 2, changed in review fix r1): Task 2 made the spaces and tabs after the
    link part of `rest`, so they moved with the link (with `[ \t]*` outside `rest` they were
    dropped). Review fix r1 keeps them in their place (`end`), so a Markdown line break (two
    end spaces) does not move to another line; no text is lost and a sorted note is not
    rewritten. See `logs/20261125-blk-t2.md` and `logs/20261126-blk-r1.md`.
- [x] `tests/sort_test.ts`, existing tests:
  - delete the tests of removed rules (note links, Markdown links, emphasis, tables,
    underlined headings, definitions, comments, two groups, "a fence after a list marker ends
    where the item ends") and list them in the task log;
  - keep the web key tests and the order tests, call `linkLine(line)?.key`, and change inputs
    that are no longer link lines (e.g. `see https://a.com/docs/.` → `- https://a.com/docs/.`;
    drop the bold/italic cases);
  - **rewrite, do not delete,** the frontmatter and fence tests. Each skipped part holds two
    out-of-order link lines (`- https://x.com/zeta`, `- https://x.com/alpha`) that must stay,
    and a sortable block follows it. Cases:
    - `` ``` `` and `~~~`;
    - a shorter closing fence does not close; a longer one does;
    - text after the opening fence (```` ```js ````);
    - inline ```` ```a``` ```` is not a fence;
    - a fence after `- ` and after `- 1. `;
    - an unclosed fence runs to the end;
    - frontmatter: a `...` line does not end it; with no closing `---` the links below are
      sorted; after a byte order mark; with `\r\n`; a YAML list line `  - https://…` inside
      it stays.
- [x] write new tests, full note in and out:
  - rule 1: one test with the table of lines above; each line is or is not sorted;
  - rule 2:
    - a blank line, a text line, a heading and a link+text line each end a block;
    - two blocks in one note are sorted each on their own;
    - a marker change ends a block: `https://a.com/zeta` / `- [ ] https://a.com/alpha` /
      `- [x] https://a.com/beta`. The first line stays; the two list lines are sorted; no task
      box lands on the line without a marker.
  - rule 3: `…/pull/2` sorts before `…/link-keeper`; numbers by value; equal keys keep their
    order;
  - rule 4: numbers `1.` `2.` `3.` stay; the indent stays; the task box moves with its link;
    the `\r` endings and the byte order mark stay;
  - rule 6: `links` counts every link line (one-line blocks too).
  - The PR #2 review case: `- 2. https://x.com/zeta` / `    ---` / `- [ ] https://x.com/alpha`
    keeps its structure.
- [x] `tests/acceptance_test.ts`: `BEFORE`/`AFTER` = the shared example. Recompute
      `SORT_CHANGES` exactly (line, `ch`, text) and the positions in the cursor tests; update
      the fixture comment (it points at the SPEC example). Keep the origin, no-write, cursor,
      count and error tests
- [x] `SPEC.md` "Sorting links": rewrite it short:
  - rules 1–6 with the link-line table;
  - the shared example as the Before/After;
  - the key examples;
  - pop-ups and *n*;
  - Known limits: a link with text around it, a note link or a Markdown link is not sorted;
    a line under a link (a sub-item, a note) does not follow it; in a nested list the child
    link lines of a block mix with their parent's lines; the command works only in the
    editor.

  Remove the old block rules and the old limits.
- [x] break each rule once in a scratch copy; `make test`, `make lint` pass; write
      `20261125-blk-t2.md`

### Task 3: `ssh -G --` in the release script

**Files:**
- Modify: `scripts/release.sh`

- [x] `github_repo`: `ssh -G -- "${BASH_REMATCH[1]}"`
- [x] check:
  - `bash -n scripts/release.sh`;
  - `ssh -G -- github.com` prints `hostname github.com`;
  - `ssh -G -- '-oHostname=x'` fails with "hostname contains invalid characters", so
    `github_repo` prints nothing: the `--` stops a host that starts with `-` from being read
    as an option;
  - the real `gh` is never run.
- [x] write `20261125-blk-t3.md`

### Task 4: Verify acceptance criteria

- [x] random check on the real `src/sort.ts` (Testing Strategy), 50k notes, 0 problems
- [x] the examples of rule 1 and the Overview give the expected result through
      `sortLinkLines`
- [x] `make test`, `make lint`, `make check`, `deno fmt --check src/ tests/` pass; write
      `20261125-blk-t4.md`

### Task 5: [Final] Update documentation

- [x] `SPEC.md`: check that "Sorting links" (rewritten in Task 2) still matches the code
      after Tasks 3–4; the commands table row says "each block of link lines"
  - note (done in Task 5): two mismatches fixed in the SPEC, not the code: fences (tabs, and
    spaces around a closing fence) and a broken `%` code (the whole key stays as it is). See
    `logs/20261125-blk-t5.md`.
- [x] `README.md` line 13 and the Use table row: "sorts each block of link lines in the open
      note (0–9, then a–z, by the last part of the link); other lines stay"
- [x] `docs/plan/done/link-sort.md`: a line at the top that this plan replaces its "which
      lines move" design
- [x] move this plan to `docs/plan/done/` (plain `mv`, no commit); fix the plan links in the
      log index; write `20261125-blk-t5.md` (move done by the harness at the end; log written)

### ➕ Review fix r1 (2026-11-26)

- [x] code review findings fixed within rules 1–6: end spaces stay in their place; key cuts
      the query/anchor first; fences count only spaces and tabs; tests for skipped lines
      ending a block, the rule 1 rows, fence and frontmatter edges, the `i` flag of
      `containsLink`; SPEC, README, AGENTS and plan docs. See `logs/20261126-blk-r1.md`.

## Post-Completion

*Items requiring manual intervention or external systems - no checkboxes, informational only*

**Manual verification** (real vault, desktop and mobile):
- a reading list with two blocks (under two headings) sorts each block on its own;
- one Ctrl/Cmd+Z undoes the sort; the cursor lands on its line.

**Owner's open items:**
- The uncommitted `Makefile` change removes `zip`, but `scripts/release.sh` runs
  `make test zip` and uploads `dist/link-keeper.zip`. `README.md`, `SPEC.md` and `AGENTS.md`
  still describe the zip.
- Update the PR #2 description to the block design before review or merge.
- The release notes of the next tag (`docs/releases/<tag>.md`) should mention the sort
  command; the tag waits for the version open item (`SPEC.md` vs `manifest.json`).
