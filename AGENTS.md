# Info

Obsidian plugin "Link Keeper": adds a link to a note only if the note does not have it yet. TypeScript, built and tested with Deno (CI uses Deno 2.9.8). There is no Node, npm or `package.json`; dependencies are in `deno.json` (`npm:obsidian`, `jsr:@std/assert`).

- `SPEC.md` is the behaviour contract (commands, duplicate rules, append rules, sort rules, pop-up texts, edge cases). Change it together with any behaviour change.
- `README.md` is the user guide (install, use, settings, development, releases).

## Important

- NEVER COMMIT WITHOUT MY APPROVAL!

## Commands

```sh
make build   # deno check, then bundle src/main.ts → plugin/main.js, copy manifest.json
make test    # build, then run all tests
make check   # type-check src/ and tests/
make lint    # deno lint
make fmt     # deno fmt src/ tests/
make zip     # build, then dist/link-keeper.zip for a release
```

Single test:

```sh
# rule tests: import src/ directly, no build needed
deno test tests/links_test.ts --filter "port"
deno test tests/sort_test.ts --filter "fence"

# acceptance tests: run the BUILT bundle, so build first or they test old code
make build && deno test --allow-read=plugin/main.js --filter "AC2"
```

## Code notes

- `URL_RE` (`src/links.ts`) has no `g` flag, so any code can share it. `LINK_LINE_RE` (`src/sort.ts`) is built from its source and flags. To find all links, use a private copy with `g`, read only with `match` (as `ALL_URLS_RE` in `containsLink`).
- In editing view the sort writes through `editor.transaction(..., "link-keeper.sort")`: one undo step, folded sections kept. The origin must not start with `input.type` or `delete`, or Obsidian merges the sort into the typing before it. In reading view it writes through `vault.process` (no editor there).

## Docs, plans, releases

- `docs/plan/` — plans; finished plans move to `docs/plan/done/`; per-plan logs go in `docs/plan/logs/`. Note the folder name is `plan`, not `plans`.
- CI (`.github/workflows/ci.yml`) only lints, builds and tests (push to `main`, pull requests). It does not publish releases.
- Releases are manual: push the tag, then `scripts/release.sh <tag>` (needs `gh`). The script stops unless the tag equals `version` in `manifest.json` (no `v`), local Deno is the CI `deno-version`, `origin` is on GitHub (all `gh` calls use that repo), `gh repo view` works, `gh release view` works or says "release not found", HEAD is the tag, there are no uncommitted or untracked files and the tag on `origin` is the same commit; then it runs `make test zip` itself and uploads `plugin/main.js`, `plugin/manifest.json`, `dist/link-keeper.zip`. It creates the GitHub release for that tag, or replaces the files (and notes) of an existing one without deleting it. Release notes come from `docs/releases/<tag>.md`.
- Known open item: versions do not agree (`SPEC.md` says 0.1 / Obsidian 1.5.0, `manifest.json` says 1.0.0 / 1.4.0); see "Open items" in `docs/plan/done/v0.1.md`.
