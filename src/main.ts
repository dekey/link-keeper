import { type Editor, normalizePath, Notice, Plugin, TFile } from "obsidian";
import { addLinkToContent, isMarkdownNote, isUrl, withMarkdownExtension } from "./links.ts";
import { LinkInputModal } from "./modal.ts";
import { DEFAULT_SETTINGS, type LinkKeeperSettings, LinkKeeperSettingTab } from "./settings.ts";
import { lineChanges, sortLinkLines } from "./sort.ts";

// Must not start with "input.type" or "delete", or undo merges the sort with typing.
const SORT_ORIGIN = "link-keeper.sort";

export default class LinkKeeperPlugin extends Plugin {
  override settings: LinkKeeperSettings = { ...DEFAULT_SETTINGS };

  override async onload(): Promise<void> {
    await this.loadSettings();

    // 1) Ask for a link and add it to the target note.
    this.addCommand({
      id: "add-link-to-target-note",
      name: "Add link to target note",
      callback: () => void this.promptAndAdd(this.getTargetPath()),
    });

    // 2) Same, but for the note you are currently in.
    this.addCommand({
      id: "add-link-to-current-note",
      name: "Add link to current note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        // Hidden for a canvas, PDF or image: appending text would break the file.
        if (!file || !isMarkdownNote(file.extension)) return false;
        if (!checking) void this.promptAndAdd(file.path);
        return true;
      },
    });

    // 3) Take the selected text in the editor and add it to the target note.
    this.addCommand({
      id: "add-selection-to-target-note",
      name: "Add selected link to target note",
      editorCheckCallback: (checking, editor) => {
        const selection = editor.getSelection().trim();
        if (!selection) return false;
        if (!checking) void this.addLink(this.getTargetPath(), selection);
        return true;
      },
    });

    // 4) Sort the link lines of the open note.
    this.addCommand({
      id: "sort-links-in-current-note",
      name: "Sort links in current note",
      editorCheckCallback: (checking, editor, ctx) => {
        const file = ctx.file;
        if (!file || !isMarkdownNote(file.extension)) return false;
        if (!checking) this.sortLinks(editor, file);
        return true;
      },
    });

    this.addRibbonIcon("link", "Add link (Link Keeper)", () => {
      void this.promptAndAdd(this.getTargetPath());
    });

    this.addSettingTab(new LinkKeeperSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<LinkKeeperSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private getTargetPath(): string {
    return withMarkdownExtension(
      normalizePath(this.settings.targetNote || DEFAULT_SETTINGS.targetNote),
    );
  }

  private async promptAndAdd(path: string): Promise<void> {
    let initial = "";
    if (this.settings.useClipboard) {
      try {
        const clip = (await navigator.clipboard.readText()).trim();
        if (isUrl(clip)) initial = clip;
      } catch {
        // Clipboard not available (permission, mobile): open the dialog empty.
      }
    }
    new LinkInputModal(this.app, initial, (link) => void this.addLink(path, link)).open();
  }

  private async getOrCreateFile(path: string): Promise<TFile> {
    const { vault } = this.app;
    const existing = vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;

    const slash = path.lastIndexOf("/");
    const folder = slash > 0 ? path.slice(0, slash) : "";
    if (folder && !vault.getAbstractFileByPath(folder)) {
      await vault.createFolder(folder);
    }
    return await vault.create(path, "");
  }

  private async addLink(path: string, link: string): Promise<void> {
    try {
      const file = await this.getOrCreateFile(path);
      let added = false;

      // vault.process reads and writes in one step, so nothing is lost
      // if the note changes at the same moment.
      await this.app.vault.process(file, (content) => {
        const result = addLinkToContent(content, link, this.settings.lineFormat);
        added = result.added;
        return result.content;
      });

      if (added) {
        new Notice(`✅ Added to “${file.basename}”:\n${link}`, 4000);
      } else {
        new Notice(`⚠️ Already in “${file.basename}”:\n${link}`, 6000);
      }
    } catch (err) {
      console.error("Link Keeper:", err);
      new Notice("Link Keeper: could not add the link — see the developer console.");
    }
  }

  // Through the editor, not vault.process, so Ctrl/Cmd+Z undoes it.
  private sortLinks(editor: Editor, file: TFile): void {
    try {
      const before = editor.getValue();
      const result = sortLinkLines(before);
      if (!result.changed) {
        new Notice(`Links in “${file.basename}” are already in order`, 4000);
        return;
      }
      const cursor = editor.getCursor();
      // Changed lines only, in one transaction: one undo step, folds kept.
      editor.transaction({ changes: lineChanges(before, result.content) }, SORT_ORIGIN);
      // A changed line moves the cursor: put it back, at most at the line end.
      const lineEnd = editor.getLine(cursor.line).length;
      editor.setCursor({ line: cursor.line, ch: Math.min(cursor.ch, lineEnd) });
      new Notice(`✅ Sorted ${result.links} links in “${file.basename}”`, 4000);
    } catch (err) {
      console.error("Link Keeper:", err);
      new Notice("Link Keeper: could not sort the links — see the developer console.");
    }
  }
}
