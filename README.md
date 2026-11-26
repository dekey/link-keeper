# Link Keeper

An Obsidian plugin that adds a link to a note only if the note does not have it yet.
If the link is already there, it tells you and changes nothing.

Good for a reading list, bookmarks or any note where you collect links and do not want
the same link twice.

- Works with web links (`https://…`) and note links (`[[Note]]`).
- Finds a link anywhere in the note: in a list, in a sentence, or inside `[title](url)`.
- `http`/`https`, `www.`, capital letters in the domain and a trailing `/` do not make a
  link "new".
- **Sort links in current note** sorts each block of link lines in the open note (0–9, then
  a–z, by the last part of the link); other lines stay. A link line holds one web link and
  nothing else (a list marker and a task box in front are fine); a block is link lines right
  under each other. Note links and `[title](url)` lines are not sorted.
- Desktop and mobile, Obsidian 1.4.0 or newer (`minAppVersion` in `manifest.json`).
- No network access; nothing leaves your vault.

Full behaviour and rules: [SPEC.md](SPEC.md).

## Install

Link Keeper is not in the Obsidian community plugin list. Install it from a GitHub release
(no build needed), or build it yourself.

### From a release

1. Open the [Releases](../../releases) page of this repository and download
   `link-keeper.zip` from the newest release.
2. Unzip it into `<path-to-your-vault>/.obsidian/plugins/`. You get the folder
   `link-keeper/` with `main.js` and `manifest.json`.
3. Turn it on in Obsidian: see step 4 below.

### From source

Do steps 1–3, then step 4.

### 1. Install Deno

The build uses [Deno](https://deno.com). Node and npm are not needed.

```sh
brew install deno          # macOS with Homebrew
# or: curl -fsSL https://deno.land/install.sh | sh
deno --version             # check it works
```

You also need `make` (on macOS it comes with the Xcode command line tools:
`xcode-select --install`).

### 2. Build the plugin

From the root of this repository:

```sh
make build
```

This creates the `plugin/` folder with the two files Obsidian needs:

```
plugin/main.js
plugin/manifest.json
```

### 3. Copy the files into your vault

Plugins live in the hidden `.obsidian` folder inside your vault. Replace
`<path-to-your-vault>` with the folder of your vault:

```sh
VAULT="<path-to-your-vault>"
mkdir -p "$VAULT/.obsidian/plugins/link-keeper"
cp plugin/main.js plugin/manifest.json "$VAULT/.obsidian/plugins/link-keeper/"
```

Not sure where the vault is? In Obsidian, right-click any note in the file list →
**Reveal in Finder** (macOS) / **Show in system explorer** (Windows); the vault is the top
folder there. Finder hides `.obsidian`: press Cmd+Shift+. to show hidden folders.

### 4. Turn it on in Obsidian

1. Open **Settings → Community plugins**.
2. If asked, click **Turn on community plugins** (this turns off Restricted mode).
3. Under **Installed plugins**, click the reload icon if Link Keeper is not listed yet.
4. Switch **Link Keeper** on.

### Mobile (iPhone, iPad, Android)

You cannot run `make` on the phone. Download the release zip or build on a computer, then
get the two files into `.obsidian/plugins/link-keeper/` of the same vault on the phone,
for example:

- with Obsidian Sync (turn on **Settings → Sync → Installed community plugins**), or
- with iCloud / a file sync app that syncs the whole vault folder, including `.obsidian`.

Then turn the plugin on as in step 4.

### Update to a new version

From a release: download the new `link-keeper.zip` and unzip it into
`.obsidian/plugins/` again, replacing the old files.

From source:

```sh
git pull
make build
cp plugin/main.js plugin/manifest.json "$VAULT/.obsidian/plugins/link-keeper/"
```

In Obsidian, switch Link Keeper off and on again (or restart Obsidian). Your settings are
kept: they are in `data.json` in the same folder, which the copy does not touch.

### Remove

Switch Link Keeper off in **Settings → Community plugins**, then delete the folder
`.obsidian/plugins/link-keeper/` in your vault.

## Use

Open the command palette (Ctrl/Cmd+P) and type "Link Keeper", or click the link icon in the
left ribbon.

| Command | What it does |
| --- | --- |
| Add link to target note | Asks for a link and adds it to the target note (default `Links.md`). |
| Add link to current note | Same, but checks and writes the note that is open now. Hidden when no Markdown note is open. |
| Add selected link to target note | Adds the text selected in the editor. Hidden when nothing is selected. |
| Sort links in current note | Sorts each block of link lines in the open note (0–9, then a–z, by the last part of the link); other lines stay. Ctrl/Cmd+Z undoes it. Hidden when no Markdown note is open in the editor. |

You can give each command a hotkey in **Settings → Hotkeys**.

In the dialog, Enter adds the link and Esc closes it. If the clipboard holds a web address,
the dialog starts filled with it.

A new link goes on its own line at the end of the note. A pop-up tells you the result:

- ✅ Added to “Links” — the link was new and is now at the end of the note.
- ⚠️ Already in “Links” — the link was there already; the note is not changed.

After **Sort links in current note** a pop-up tells you:

- ✅ Sorted *n* links in “Note” — the links in each block are now in order; *n* counts all
  link lines in the note.
- Links in “Note” are already in order — nothing moved; the note is not changed.

## Settings

**Settings → Link Keeper**:

| Setting | Default | What it does |
| --- | --- | --- |
| Target note | `Links.md` | Note that collects links. Folders are fine, e.g. `Inbox/Links.md`. The note and folder are created when needed. |
| Line format | `- {link}` | How each new line is written; `{link}` is replaced by the link. E.g. `- [ ] {link}` for tasks. |
| Pre-fill from clipboard | On | Starts the dialog with the web address from the clipboard. |

## Development

```sh
make build   # type-check, then build plugin/main.js and copy manifest.json
make test    # build, then run all tests
make check   # type-check only
make lint    # lint
make fmt     # format the code
make zip     # build, then pack dist/link-keeper.zip for a release
make clean   # delete plugin/ and dist/
```

| Path | What is in it |
| --- | --- |
| `src/links.ts` | The duplicate and line rules. No Obsidian imports, so it is tested on its own. |
| `src/sort.ts` | The sort rules: which lines move, sort key and order. No Obsidian imports either. |
| `src/main.ts`, `src/modal.ts`, `src/settings.ts` | Commands, dialog and settings tab. |
| `tests/links_test.ts`, `tests/sort_test.ts` | Tests for the duplicate and line rules and for the sort rules. |
| `tests/acceptance_test.ts` | One test per acceptance criterion; runs the built `plugin/main.js` in a fake vault (`tests/fake_obsidian.ts`). |
| `SPEC.md` | What the plugin does, in detail. |
| `docs/plan/` | Plans and their status. |
| `docs/releases/` | Release notes, one file per tag. |
| `.github/workflows/ci.yml` | Lint, build and tests on every push to `main` and every pull request. |
| `scripts/release.sh` | Checks the tag, builds and tests, then creates the GitHub release for the tag, or replaces its files if it exists. |

`plugin/` and `dist/` are build output and are not kept in git.

### Releases

GitHub Actions does not publish releases. Make one by hand with the
[GitHub CLI](https://cli.github.com) (`gh`, logged in). Push the tag first, then run the
script from the tagged commit:

```sh
git tag 1.0.0
git push origin 1.0.0
scripts/release.sh 1.0.0
```

`scripts/release.sh` first checks that the tag is the `version` in `manifest.json`, that your
Deno is the version CI uses (`deno-version` in `.github/workflows/ci.yml`), that the
checked-out commit is the tag, that there are no uncommitted or untracked files, that the tag
on GitHub is the same commit, and that `gh` can see the repository and the release. All `gh`
calls go to the GitHub repository of `origin` (an https or SSH URL, an SSH host alias for
github.com, or an `insteadOf` short name). Then it runs `make test zip` itself and uploads `main.js`,
`manifest.json` and `link-keeper.zip`. A failed check or test stops it before anything is
published, so a release always holds files built and tested from the tagged code.

Release notes come from `docs/releases/<tag>.md` (e.g. `docs/releases/1.0.0.md`) when that
file exists; otherwise GitHub writes them from the commits when the release is created. Keep
notes in that file, not only on GitHub: a re-run puts that file's text into the release.

If the tag already has a release, `scripts/release.sh` replaces its three files (and its
notes, when the notes file exists). It does not delete the release first, so if an upload
fails, the release is still there and running the script again finishes it. The tag stays.
To publish a fix under the same version, move the tag, push it again and run the steps above:

```sh
git tag -f 1.0.0
git push -f origin 1.0.0
```

Obsidian's community plugin list and BRAT expect the tag to be the same as `version` in
`manifest.json`, without a `v` in front; `scripts/release.sh` stops when they differ.

## License

MIT — see [LICENSE](LICENSE).
