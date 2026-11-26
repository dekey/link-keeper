# Log: Sort links in current note

Plan: [docs/plan/done/link-sort.md](../done/link-sort.md)

## Task logs

1. [20261125-plan.md](20261125-plan.md) — plan created
2. [20261125-review.md](20261125-review.md) — plan review, fixes applied
3. [20261125-task1.md](20261125-task1.md) — Task 1: sort key for one line
4. [20261125-task2.md](20261125-task2.md) — Task 2: sort the link lines of a note
5. [20261125-task3.md](20261125-task3.md) — Task 3: "Sort links in current note" command
6. [20261125-task4.md](20261125-task4.md) — Task 4: verify acceptance criteria
7. [20261125-task5.md](20261125-task5.md) — Task 5: update documentation
8. [20261125-fix1.md](20261125-fix1.md) — review fix 1: code review findings checked and fixed
9. [20261125-fix2.md](20261125-fix2.md) — review fix 2: table end, `--> <!--` comment, underlined headings
10. [20261125-fix3.md](20261125-fix3.md) — review fix 3: list-item and plain link lines sort apart
11. [20261125-fix4.md](20261125-fix4.md) — review fix 4: list markers stay in place, footnotes never move
12. [20261125-fix5.md](20261125-fix5.md) — review fix 5: plain link lines keep the indent of their place
13. [20261125-smells.md](20261125-smells.md) — smells review: minor findings fixed, no behaviour change
14. [20261125-exec.md](20261125-exec.md) — plan run summary: phases, user questions, final checks
15. [20261125-review2.md](20261125-review2.md) — review fix 6: headings in lists, table end, release checks
16. [20261125-review3.md](20261125-review3.md) — review fix 7: numbered lines in headings, tables, release.sh builds
17. [20261125-review4.md](20261125-review4.md) — review fix 8: editor transaction, comment lines, numbered lists, release.sh version check
18. [20261125-review5.md](20261125-review5.md) — review fix 9: frontmatter as Obsidian, undo origin, bold links, release.sh repo and Deno checks
19. [20261125-review6.md](20261125-review6.md) — review fix 10: Markdown link titles, list-item code blocks, indented heading text, release.sh repo access

## Open items

- Review findings not applied: #13 (separate "No links" pop-up), #15, #16 (extra doc places).
- Manual check in a real vault: undo after sort, cursor after sort, mobile. Reading view:
  `SPEC.md` now says the command is hidden there (read in the Obsidian 1.15.1 app code);
  confirm it in the vault.
- Manual check in a real vault (review fix 2): a table with a list or heading right under it
  (no blank line), and an underlined heading (`===` / `---`), look the same in Obsidian as the
  sort rules assume (rules taken from Markdown, not checked in Obsidian).
- `SPEC.md` "Overview → Scope", "Source and build" (`sort.ts` also has no Obsidian imports)
  and "Key implementation choices" (`vault.process` is used for adding only) do not mention
  sorting (#16, left as the user decided).
- Scratch copies under `/tmp` from the rule-break checks are safe to delete:
  `/tmp/lk-mut.qZdD` and `/tmp/lk-main.orig` (Task 3), `/tmp/lk-t4.mKRK` (Task 4),
  `/tmp/lk-fix1.YlXb` (review fix 1), `/tmp/lk-fix2.E2VS` (review fix 2),
  `/tmp/lk-fix3.8IQS` (review fix 3), `/tmp/lk-fix4.YOAY` (review fix 4),
  `/tmp/lk-fix5.XNL6` (review fix 5), `/tmp/lk-mut2.Hthr` and `/tmp/lk-clone.8yti` (review
  fix 6), `/tmp/lk-rel.6yPt` (review fix 7), `/tmp/lk-review/` (reviewers), and the small
  helper files `/tmp/lk-probe.ts`, `/tmp/lk-spec-edit.pl`, `/tmp/lk-SPEC.new`, `/tmp/lk-idx.pl`,
  `/tmp/lk-rel-dir`.
- Review fixes 6–10, not done:
  - Manual check in a real vault: after a sort, folded sections stay folded and one
    Ctrl/Cmd+Z undoes the whole sort (review fix 8 uses `editor.transaction`).
  - `make zip` in CI: blocked by the auto mode classifier (see review fix 7–10 logs); add it by
    hand if wanted.
