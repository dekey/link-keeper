import { type App, Modal, Setting } from "obsidian";

/** Dialog with one text field and an Add button. Enter submits, Esc closes. */
export class LinkInputModal extends Modal {
  private readonly initial: string;
  private readonly onSubmit: (link: string) => void;

  constructor(app: App, initial: string, onSubmit: (link: string) => void) {
    super(app);
    this.initial = initial;
    this.onSubmit = onSubmit;
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Add link" });

    const input = contentEl.createEl("input", { type: "text" });
    input.style.width = "100%";
    input.placeholder = "https://… or [[Note]]";
    input.value = this.initial;

    const submit = (): void => {
      const value = input.value.trim();
      if (!value) return;
      this.close();
      this.onSubmit(value);
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    });

    new Setting(contentEl).addButton((button) =>
      button.setButtonText("Add").setCta().onClick(submit)
    );

    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
