// In-memory stand-in for the parts of the Obsidian API that Link Keeper uses.
// It loads the built plugin/main.js and drives it the way a user would (commands,
// dialog, settings tab), so the acceptance tests check the file Obsidian really loads.
// Follows the documented API: vault.create / createFolder throw when the path exists,
// and create needs the parent folder to exist.

const BUNDLE = new URL("../plugin/main.js", import.meta.url);

export interface NoticeRecord {
  message: string;
  duration: number | undefined;
}

/** A place in the editor: line and character, both counted from 0. */
export interface EditorPosition {
  line: number;
  ch: number;
}

export interface EditorOptions {
  /** Where the cursor is before the command runs. Default: start of the note. */
  cursor?: EditorPosition;
  /** When true, transaction throws, so the error path can be tested. */
  failOnWrite?: boolean;
}

export interface EditorChange {
  from: EditorPosition;
  to?: EditorPosition;
  text: string;
}

export class FakeEditor {
  /** Every transaction, in order. */
  readonly transactions: { changes: EditorChange[]; origin: string | undefined }[] = [];
  private text: string;
  private cursor: EditorPosition;
  private readonly selection: string;
  private readonly failOnWrite: boolean;

  constructor(text: string, selection = "", options: EditorOptions = {}) {
    this.text = text;
    this.selection = selection;
    this.cursor = { ...(options.cursor ?? { line: 0, ch: 0 }) };
    this.failOnWrite = options.failOnWrite ?? false;
  }

  getSelection(): string {
    return this.selection;
  }

  getValue(): string {
    return this.text;
  }

  /** Positions refer to the text before. A cursor on a changed line goes to ch 0. */
  transaction(tx: { changes?: EditorChange[] }, origin?: string): void {
    const changes = tx.changes ?? [];
    this.transactions.push({ changes, origin });
    if (this.failOnWrite) throw new Error("editor write failed");
    const ranges = changes.map((change) => ({
      from: this.offset(change.from),
      to: this.offset(change.to ?? change.from),
      text: change.text,
    }));
    // Backwards, so a change does not shift the ones before it.
    ranges.sort((a, b) => b.from - a.from);
    for (const { from, to, text } of ranges) {
      this.text = this.text.slice(0, from) + text + this.text.slice(to);
    }
    if (changes.some((change) => change.from.line === this.cursor.line)) {
      this.cursor = { line: this.cursor.line, ch: 0 };
    }
  }

  private offset(position: EditorPosition): number {
    const lines = this.text.split("\n");
    let offset = position.ch;
    for (let i = 0; i < position.line; i++) offset += lines[i].length + 1;
    return offset;
  }

  /** The text of one line, without its line break. */
  getLine(line: number): string {
    return this.text.split("\n")[line] ?? "";
  }

  getCursor(): EditorPosition {
    return { ...this.cursor };
  }

  /** Like Obsidian, `ch` is not stopped at the line end; past the note end it throws. */
  setCursor(target: EditorPosition): void {
    const lines = this.text.split("\n");
    let offset = target.ch;
    for (let i = 0; i < target.line; i++) offset += lines[i].length + 1;
    if (offset > this.text.length) throw new RangeError("Selection points outside of document");
    let line = 0;
    while (offset > lines[line].length) {
      offset -= lines[line].length + 1;
      line++;
    }
    this.cursor = { line, ch: offset };
  }
}

/** What Obsidian passes to an editor command as `ctx`; only `file` is used here. */
interface EditorContext {
  file: FakeFile | null;
}

interface Command {
  id: string;
  name: string;
  callback?: () => unknown;
  checkCallback?: (checking: boolean) => boolean | void;
  editorCheckCallback?: (
    checking: boolean,
    editor: FakeEditor,
    ctx: EditorContext,
  ) => boolean | void;
}

type KeyListener = (event: { key: string; preventDefault(): void }) => void;

export class FakeElement {
  readonly tag: string;
  text = "";
  type = "";
  value = "";
  placeholder = "";
  style: Record<string, string> = {};
  selected = false;
  children: FakeElement[] = [];
  settings: FakeSetting[] = [];
  private keyListeners: KeyListener[] = [];

  constructor(tag: string) {
    this.tag = tag;
  }

  createEl(tag: string, info: { text?: string; type?: string } = {}): FakeElement {
    const child = new FakeElement(tag);
    child.text = info.text ?? "";
    child.type = info.type ?? "";
    this.children.push(child);
    return child;
  }

  empty(): void {
    this.children = [];
    this.settings = [];
  }

  addEventListener(name: string, listener: KeyListener): void {
    if (name === "keydown") this.keyListeners.push(listener);
  }

  focus(): void {}

  select(): void {
    this.selected = true;
  }

  pressKey(key: string): void {
    for (const listener of this.keyListeners) listener({ key, preventDefault() {} });
  }

  find(tag: string): FakeElement | undefined {
    for (const child of this.children) {
      if (child.tag === tag) return child;
      const inner = child.find(tag);
      if (inner) return inner;
    }
    return undefined;
  }
}

class FakeText {
  value = "";
  changed: ((value: string) => unknown) | undefined;
  setPlaceholder(_placeholder: string): this {
    return this;
  }
  setValue(value: string): this {
    this.value = value;
    return this;
  }
  onChange(handler: (value: string) => unknown): this {
    this.changed = handler;
    return this;
  }
}

class FakeToggle {
  value = false;
  changed: ((value: boolean) => unknown) | undefined;
  setValue(value: boolean): this {
    this.value = value;
    return this;
  }
  onChange(handler: (value: boolean) => unknown): this {
    this.changed = handler;
    return this;
  }
}

class FakeButton {
  setButtonText(_text: string): this {
    return this;
  }
  setCta(): this {
    return this;
  }
  onClick(_handler: () => unknown): this {
    return this;
  }
}

export class FakeSetting {
  name = "";
  text: FakeText | undefined;
  toggle: FakeToggle | undefined;

  constructor(containerEl: FakeElement) {
    containerEl.settings.push(this);
  }
  setName(name: string): this {
    this.name = name;
    return this;
  }
  setDesc(_desc: string): this {
    return this;
  }
  addText(build: (text: FakeText) => unknown): this {
    this.text = new FakeText();
    build(this.text);
    return this;
  }
  addToggle(build: (toggle: FakeToggle) => unknown): this {
    this.toggle = new FakeToggle();
    build(this.toggle);
    return this;
  }
  addButton(build: (button: FakeButton) => unknown): this {
    build(new FakeButton());
    return this;
  }
}

class FakeAbstractFile {
  readonly path: string;
  constructor(path: string) {
    this.path = path;
  }
  get name(): string {
    return this.path.slice(this.path.lastIndexOf("/") + 1);
  }
}

class FakeFile extends FakeAbstractFile {
  get extension(): string {
    const dot = this.name.lastIndexOf(".");
    return dot < 0 ? "" : this.name.slice(dot + 1);
  }
  get basename(): string {
    const dot = this.name.lastIndexOf(".");
    return dot < 0 ? this.name : this.name.slice(0, dot);
  }
}

class FakeFolder extends FakeAbstractFile {}

export class FakeVault {
  readonly notes = new Map<string, string>();
  readonly folders = new Set<string>();
  private readonly files = new Map<string, FakeFile>();

  getAbstractFileByPath(path: string): FakeAbstractFile | null {
    if (this.notes.has(path)) return this.fileFor(path);
    if (this.folders.has(path)) return new FakeFolder(path);
    return null;
  }

  createFolder(path: string): Promise<FakeFolder> {
    if (this.getAbstractFileByPath(path)) {
      return Promise.reject(new Error("Folder already exists."));
    }
    this.addFolderWithParents(path);
    return Promise.resolve(new FakeFolder(path));
  }

  create(path: string, data: string): Promise<FakeFile> {
    if (this.getAbstractFileByPath(path)) return Promise.reject(new Error("File already exists."));
    const parent = parentOf(path);
    if (parent && !this.folders.has(parent)) {
      return Promise.reject(new Error(`Folder "${parent}" does not exist.`));
    }
    this.notes.set(path, data);
    return Promise.resolve(this.fileFor(path));
  }

  process(file: FakeFile, change: (data: string) => string): Promise<string> {
    const current = this.notes.get(file.path);
    if (current === undefined) return Promise.reject(new Error(`No file "${file.path}".`));
    const next = change(current);
    this.notes.set(file.path, next);
    return Promise.resolve(next);
  }

  /** Puts a note in the vault before the test starts. */
  seed(path: string, content: string): void {
    const parent = parentOf(path);
    if (parent) this.addFolderWithParents(parent);
    this.notes.set(path, content);
  }

  fileFor(path: string): FakeFile {
    let file = this.files.get(path);
    if (!file) {
      file = new FakeFile(path);
      this.files.set(path, file);
    }
    return file;
  }

  private addFolderWithParents(path: string): void {
    const parts = path.split("/");
    for (let i = 1; i <= parts.length; i++) this.folders.add(parts.slice(0, i).join("/"));
  }
}

interface FakeApp {
  vault: FakeVault;
  workspace: { getActiveFile(): FakeFile | null };
}

export class FakePlugin {
  readonly app: FakeApp;
  readonly commands = new Map<string, Command>();
  readonly settingTabs: FakePluginSettingTab[] = [];
  savedData: unknown = null;

  constructor(app: FakeApp, _manifest: unknown) {
    this.app = app;
  }
  addCommand(command: Command): Command {
    this.commands.set(command.id, command);
    return command;
  }
  addRibbonIcon(_icon: string, _title: string, _onClick: () => unknown): FakeElement {
    return new FakeElement("div");
  }
  addSettingTab(tab: FakePluginSettingTab): void {
    this.settingTabs.push(tab);
  }
  loadData(): Promise<unknown> {
    return Promise.resolve(this.savedData);
  }
  saveData(data: unknown): Promise<void> {
    this.savedData = structuredClone(data);
    return Promise.resolve();
  }
  onload(): Promise<void> | void {}
}

export class FakePluginSettingTab {
  readonly app: FakeApp;
  readonly containerEl = new FakeElement("div");
  constructor(app: FakeApp, _plugin: FakePlugin) {
    this.app = app;
  }
  display(): void {}
}

interface FakeModal {
  contentEl: FakeElement;
  isOpen: boolean;
}

type PluginClass = new (app: FakeApp, manifest: unknown) => FakePlugin;

function parentOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash > 0 ? path.slice(0, slash) : "";
}

function normalizePath(path: string): string {
  const cleaned = path.replace(/[\\/]+/g, "/").replace(/^\/|\/$/g, "").replace(/[  ]/g, " ")
    .normalize("NFC");
  return cleaned === "" ? "/" : cleaned;
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export interface HarnessOptions {
  /** Text on the clipboard. Leave out to make the clipboard unreadable. */
  clipboard?: string;
  /** Notes that exist before the test starts, path → content. */
  notes?: Record<string, string>;
  /** Path of the file open in the editor. */
  activeFile?: string;
}

/** One fresh vault with the built plugin loaded into it. */
export class Harness {
  readonly vault = new FakeVault();
  readonly notices: NoticeRecord[] = [];
  readonly modals: FakeModal[] = [];
  activeFile: FakeFile | null = null;
  readonly app: FakeApp = {
    vault: this.vault,
    workspace: { getActiveFile: () => this.activeFile },
  };
  private plugin: FakePlugin | undefined;

  static async start(options: HarnessOptions = {}): Promise<Harness> {
    const harness = new Harness();
    for (const [path, content] of Object.entries(options.notes ?? {})) {
      harness.vault.seed(path, content);
    }
    if (options.activeFile) harness.activeFile = harness.vault.fileFor(options.activeFile);

    const LinkKeeper = await harness.loadPlugin(options.clipboard);
    harness.plugin = new LinkKeeper(harness.app, { id: "link-keeper" });
    await harness.plugin.onload();
    return harness;
  }

  note(path: string): string | undefined {
    return this.vault.notes.get(path);
  }

  lastNotice(): NoticeRecord | undefined {
    return this.notices.at(-1);
  }

  savedSettings(): unknown {
    return this.loaded().savedData;
  }

  /** Runs a command from the palette (not the editor-only one). */
  async run(commandId: string): Promise<void> {
    const command = this.command(commandId);
    if (command.callback) command.callback();
    else if (command.checkCallback) command.checkCallback(false);
    else throw new Error(`${commandId} needs an editor: use runWithSelection`);
    await settle();
  }

  /** Runs an editor command with `selection` selected. */
  async runWithSelection(commandId: string, selection: string): Promise<void> {
    const command = this.command(commandId);
    if (!command.editorCheckCallback) throw new Error(`${commandId} is not an editor command`);
    command.editorCheckCallback(false, new FakeEditor("", selection), { file: this.activeFile });
    await settle();
  }

  /** Runs an editor command on `text` if it shows for `path`; returns the editor. */
  async runInEditor(
    commandId: string,
    path: string,
    text: string,
    options: EditorOptions = {},
  ): Promise<FakeEditor> {
    const command = this.command(commandId);
    if (!command.editorCheckCallback) throw new Error(`${commandId} is not an editor command`);
    const editor = new FakeEditor(text, "", options);
    const ctx = { file: this.vault.fileFor(path) };
    if (command.editorCheckCallback(true, editor, ctx) !== true) {
      throw new Error(`${commandId} is hidden for "${path}"`);
    }
    command.editorCheckCallback(false, editor, ctx);
    await settle();
    return editor;
  }

  /** Whether the command shows in the palette right now. */
  isAvailable(commandId: string, selection = ""): boolean {
    const command = this.command(commandId);
    if (command.callback) return true;
    if (command.checkCallback) return command.checkCallback(true) === true;
    if (command.editorCheckCallback) {
      const editor = new FakeEditor("", selection);
      return command.editorCheckCallback(true, editor, { file: this.activeFile }) === true;
    }
    return false;
  }

  /** The text field of the dialog that is open now. */
  dialogInput(): FakeElement {
    const modal = this.modals.at(-1);
    if (!modal?.isOpen) throw new Error("no dialog is open");
    const input = modal.contentEl.find("input");
    if (!input) throw new Error("dialog has no text field");
    return input;
  }

  /** Types `text` into the open dialog and presses Enter. */
  async submitDialog(text: string): Promise<void> {
    const input = this.dialogInput();
    input.value = text;
    input.pressKey("Enter");
    await settle();
  }

  async addViaDialog(commandId: string, text: string): Promise<void> {
    await this.run(commandId);
    await this.submitDialog(text);
  }

  /** Changes a setting the way the user does: through the settings tab. */
  async changeSetting(name: string, value: string | boolean): Promise<void> {
    const tab = this.loaded().settingTabs[0];
    if (!tab) throw new Error("plugin has no settings tab");
    tab.display();
    const setting = tab.containerEl.settings.find((s) => s.name === name);
    if (!setting) throw new Error(`no setting named "${name}"`);
    const handler = typeof value === "string" ? setting.text?.changed : setting.toggle?.changed;
    if (!handler) throw new Error(`setting "${name}" has no ${typeof value} field`);
    await (handler as (v: string | boolean) => unknown)(value);
  }

  private loaded(): FakePlugin {
    if (!this.plugin) throw new Error("plugin not loaded");
    return this.plugin;
  }

  private command(id: string): Command {
    const command = this.loaded().commands.get(id);
    if (!command) throw new Error(`no command "${id}"`);
    return command;
  }

  private async loadPlugin(clipboard: string | undefined): Promise<PluginClass> {
    let code: string;
    try {
      code = await Deno.readTextFile(BUNDLE);
    } catch {
      throw new Error("plugin/main.js not found: run `make build` first");
    }

    const { modals, notices } = this;
    class Modal {
      readonly app: FakeApp;
      readonly contentEl = new FakeElement("div");
      isOpen = false;
      constructor(app: FakeApp) {
        this.app = app;
      }
      open(): void {
        this.isOpen = true;
        modals.push(this);
        this.onOpen();
      }
      close(): void {
        this.isOpen = false;
        this.onClose();
      }
      onOpen(): void {}
      onClose(): void {}
    }
    class Notice {
      constructor(message: string, duration?: number) {
        notices.push({ message, duration });
      }
    }
    const obsidian = {
      Plugin: FakePlugin,
      PluginSettingTab: FakePluginSettingTab,
      Setting: FakeSetting,
      Modal,
      Notice,
      TFile: FakeFile,
      normalizePath,
    };

    const requireStub = (name: string): unknown => {
      if (name === "obsidian") return obsidian;
      throw new Error(
        `plugin/main.js asked for "${name}"; only "obsidian" is provided by Obsidian`,
      );
    };
    const navigatorStub = {
      clipboard: {
        readText: () =>
          clipboard === undefined
            ? Promise.reject(new Error("clipboard not allowed"))
            : Promise.resolve(clipboard),
      },
    };
    const runNow = (callback: () => void): void => callback();

    const module = { exports: {} as { default?: PluginClass } };
    new Function("require", "module", "exports", "navigator", "setTimeout", code)(
      requireStub,
      module,
      module.exports,
      navigatorStub,
      runNow,
    );
    if (!module.exports.default) throw new Error("plugin/main.js has no default export");
    return module.exports.default;
  }
}
