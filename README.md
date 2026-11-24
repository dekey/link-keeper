# Link Keeper

An Obsidian plugin that adds a link to a note only if the note does not have it yet.
If the link is already there, it tells you and changes nothing.

Good for a reading list, bookmarks or any note where you collect links and do not want
the same link twice.

- Works with web links (`https://…`) and note links (`[[Note]]`).
- Finds a link anywhere in the note: in a list, in a sentence, or inside `[title](url)`.
- `http`/`https`, `www.`, capital letters in the domain and a trailing `/` do not make a
  link "new".
- Desktop and mobile, Obsidian 1.4.0 or newer (`minAppVersion` in `manifest.json`).
- No network access; nothing leaves your vault.

Full behaviour and rules: [SPEC.md](SPEC.md).

## Install

Link Keeper is not in the Obsidian community plugin list. You build it once and copy two
files into your vault.

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

You cannot run `make` on the phone. Build on a computer, then get the two files into
`.obsidian/plugins/link-keeper/` of the same vault on the phone, for example:

- with Obsidian Sync (turn on **Settings → Sync → Installed community plugins**), or
- with iCloud / a file sync app that syncs the whole vault folder, including `.obsidian`.

Then turn the plugin on as in step 4.

### Update to a new version

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

You can give each command a hotkey in **Settings → Hotkeys**.

In the dialog, Enter adds the link and Esc closes it. If the clipboard holds a web address,
the dialog starts filled with it.

A new link goes on its own line at the end of the note. A pop-up tells you the result:

- ✅ Added to “Links” — the link was new and is now at the end of the note.
- ⚠️ Already in “Links” — the link was there already; the note is not changed.

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
make clean   # delete plugin/
```

| Path | What is in it |
| --- | --- |
| `src/links.ts` | The duplicate and line rules. No Obsidian imports, so it is tested on its own. |
| `src/main.ts`, `src/modal.ts`, `src/settings.ts` | Commands, dialog and settings tab. |
| `tests/links_test.ts` | Tests for the rules. |
| `tests/acceptance_test.ts` | One test per acceptance criterion; runs the built `plugin/main.js` in a fake vault (`tests/fake_obsidian.ts`). |
| `SPEC.md` | What the plugin does, in detail. |
| `docs/plan/` | Plans and their status. |

`plugin/` is build output and is not kept in git.

## License

MIT — see [LICENSE](LICENSE).
