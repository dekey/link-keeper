import { type App, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_LINE_FORMAT } from "./links.ts";
import type LinkKeeperPlugin from "./main.ts";

export interface LinkKeeperSettings {
  /** The note links are collected in. */
  targetNote: string;
  /** How each new link is written; {link} is replaced. */
  lineFormat: string;
  /** Pre-fill the dialog with a web address from the clipboard. */
  useClipboard: boolean;
}

export const DEFAULT_SETTINGS: LinkKeeperSettings = {
  targetNote: "Links.md",
  lineFormat: DEFAULT_LINE_FORMAT,
  useClipboard: true,
};

export class LinkKeeperSettingTab extends PluginSettingTab {
  private readonly plugin: LinkKeeperPlugin;

  constructor(app: App, plugin: LinkKeeperPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Target note")
      .setDesc(
        "Path of the note links are added to, e.g. Links.md or Inbox/Links.md. Created if missing.",
      )
      .addText((text) =>
        text.setPlaceholder(DEFAULT_SETTINGS.targetNote)
          .setValue(this.plugin.settings.targetNote)
          .onChange(async (value) => {
            this.plugin.settings.targetNote = value.trim() || DEFAULT_SETTINGS.targetNote;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Line format")
      .setDesc(
        "How a new link is written. {link} is replaced with the link. Without {link}, the default is used.",
      )
      .addText((text) =>
        text.setPlaceholder(DEFAULT_SETTINGS.lineFormat)
          .setValue(this.plugin.settings.lineFormat)
          .onChange(async (value) => {
            this.plugin.settings.lineFormat = value || DEFAULT_SETTINGS.lineFormat;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Pre-fill from clipboard")
      .setDesc("If the clipboard holds a URL, put it in the input box automatically.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.useClipboard).onChange(async (value) => {
          this.plugin.settings.useClipboard = value;
          await this.plugin.saveSettings();
        })
      );
  }
}
