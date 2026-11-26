# Logs: Sort blocks of link lines

Plan: [docs/plan/done/link-sort-blocks.md](../done/link-sort-blocks.md)

1. [20261125-plan2.md](20261125-plan2.md) — PR #2 review, per-list investigation, per-list
   plan (dropped)
2. [20261125-plan3.md](20261125-plan3.md) — plan review of the per-list plan; owner asks for a
   simple block sort; this plan created
3. [20261125-blk-t1.md](20261125-blk-t1.md) — Task 1: `URL_RE` without `g`, private global
   copy for `containsLink`
4. [20261125-blk-t2.md](20261125-blk-t2.md) — Task 2: sort each block of link lines; old
   block rules, note and Markdown links removed; tests and SPEC "Sorting links" rewritten
5. [20261125-blk-t3.md](20261125-blk-t3.md) — Task 3: `ssh -G --` in `scripts/release.sh`
   `github_repo`, so a host that starts with `-` is not read as an ssh option
6. [20261125-blk-t4.md](20261125-blk-t4.md) — Task 4: random check on the real
   `src/sort.ts` (450,000 notes, 0 problems; 9 broken copies all caught), rule 1 and
   Overview examples (56 checks pass); no code change
7. [20261125-blk-t5.md](20261125-blk-t5.md) — Task 5: docs. SPEC commands row and intro say
   "each block of link lines"; two SPEC mismatches fixed (fences: tabs and spaces around a
   closing fence; broken `%` keeps the whole key); README feature line and Use row; note at
   the top of `done/link-sort.md`
8. [20261126-blk-r1.md](20261126-blk-r1.md) — Review fix r1: end spaces stay in their place;
   key cuts the query/anchor first; fences count only spaces and tabs; new tests (code block
   ends a block, rule 1 rows, fence and frontmatter edges, `i` flag); SPEC, README, AGENTS
   and plan docs
9. [20261126-blk-sm.md](20261126-blk-sm.md) — Review fix: one shared `LIST_MARKER` for
   link lines and fences; two `links_test.ts` names say the rule; Windows line ending test
   for `lineChanges` uses web links
10. [20261126-blk-exec.md](20261126-blk-exec.md) — plan run summary: tasks, reviews, plan moved, final checks

## Open items

- The owner's uncommitted `Makefile` change removes `zip`; `scripts/release.sh` and the docs
  still use it.
- Update the PR #2 description to the block design.
- Release notes of the next tag (`docs/releases/<tag>.md`) should mention the sort command;
  the tag waits for the version open item (`SPEC.md` 0.1 vs `manifest.json` 1.0.0).
- Closed (review fix r1): a no-break space next to a fence no longer counts as a space.
