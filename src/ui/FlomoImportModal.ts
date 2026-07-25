import { Modal, Notice, Setting } from "obsidian";
import type { App } from "obsidian";

import { t } from "../i18n";
import type { FlomoImportOptions, FlomoImportPreview, FlomoImportResult } from "../services/FlomoImportService";
import { normalizeVaultPath } from "../utils/path";

export interface FlomoImportModalOptions {
	defaultFolder: string;
	onImport: (file: File, folder: string, options: FlomoImportOptions) => Promise<FlomoImportResult>;
	onPreview: (file: File, options: FlomoImportOptions) => Promise<FlomoImportPreview>;
	onEnsureScannedFolder: (folder: string) => Promise<void>;
}

/** Small, self-contained picker so importing a local Flomo export never needs a filesystem path. */
export class FlomoImportModal extends Modal {
	private selectedFile: File | null = null;
	private targetFolder = "";
	private preview: FlomoImportPreview | null = null;
	private statusEl: HTMLElement | null = null;
	private importButton: HTMLButtonElement | null = null;
	private skipAudioAttachments = true;
	private skipImageAttachments = false;

	constructor(app: App, private readonly options: FlomoImportModalOptions) {
		super(app);
		this.targetFolder = options.defaultFolder;
	}

	onOpen(): void {
		this.modalEl.addClass("plain-memo-flomo-import-modal");
		this.titleEl.setText(t("settings.file.flomoImport"));
		this.contentEl.empty();
		this.contentEl.createEl("p", { text: t("settings.file.flomoImportModalDescription") });

		const fileInput = this.contentEl.createEl("input", { attr: { type: "file", accept: ".zip,.html,text/html,application/zip" } });
		fileInput.addEventListener("change", () => { void this.handleFileSelection(fileInput.files?.[0] ?? null); });
		new Setting(this.contentEl)
			.setName(t("settings.file.flomoImportFolder"))
			.setDesc(t("settings.file.flomoImportFolderDescription"))
			.addText((text) => text.setPlaceholder("Memos").setValue(this.targetFolder).onChange((value) => {
				this.targetFolder = value;
				this.refreshImportButton();
			}));
		new Setting(this.contentEl)
			.setName(t("settings.file.flomoImportSkipAudioAttachments"))
			.setDesc(t("settings.file.flomoImportSkipAudioAttachmentsDescription"))
			.addToggle((toggle) => toggle.setValue(this.skipAudioAttachments).onChange((value) => {
				this.skipAudioAttachments = value;
				void this.refreshPreview();
			}));
		new Setting(this.contentEl)
			.setName(t("settings.file.flomoImportSkipImageAttachments"))
			.setDesc(t("settings.file.flomoImportSkipImageAttachmentsDescription"))
			.addToggle((toggle) => toggle.setValue(this.skipImageAttachments).onChange((value) => {
				this.skipImageAttachments = value;
				void this.refreshPreview();
			}));

		this.statusEl = this.contentEl.createDiv({ cls: "setting-item-description plain-memo-flomo-import-status" });
		this.setStatus(t("settings.file.flomoImportNoFile"));
		const actions = this.contentEl.createDiv({ cls: "modal-button-container" });
		actions.createEl("button", { text: t("confirm.cancel") }).addEventListener("click", () => this.close());
		this.importButton = actions.createEl("button", { cls: "mod-cta", text: t("settings.file.flomoImportAction") });
		this.importButton.addEventListener("click", () => { void this.importSelectedFile(); });
		this.refreshImportButton();
	}

	onClose(): void { this.contentEl.empty(); }

	private async handleFileSelection(file: File | null): Promise<void> {
		this.selectedFile = file;
		this.preview = null;
		this.refreshImportButton();
		if (file === null) {
			this.setStatus(t("settings.file.flomoImportNoFile"));
			return;
		}
		await this.refreshPreview();
	}

	private async refreshPreview(): Promise<void> {
		const file = this.selectedFile;
		if (file === null) return;
		this.preview = null;
		this.refreshImportButton();
		this.setStatus(t("settings.file.flomoImportReading"));
		try {
			this.preview = await this.options.onPreview(file, this.getImportOptions());
			const { memoCount, attachmentCount, missingAttachmentCount } = this.preview;
			this.setStatus(t("settings.file.flomoImportPreview", { memoCount, attachmentCount, missingAttachmentCount }));
		} catch (error) {
			this.selectedFile = null;
			this.setStatus(t("settings.file.flomoImportReadFailed", { message: error instanceof Error ? error.message : String(error) }));
		}
		this.refreshImportButton();
	}

	private async importSelectedFile(): Promise<void> {
		const file = this.selectedFile;
		const folder = normalizeVaultPath(this.targetFolder);
		if (file === null || !folder || this.preview === null) return;
		this.importButton?.setAttribute("disabled", "true");
		this.setStatus(t("settings.file.flomoImportRunning"));
		try {
			await this.options.onEnsureScannedFolder(folder);
			const result = await this.options.onImport(file, folder, this.getImportOptions());
			this.setStatus(formatImportResult(result));
			new Notice(t("settings.file.flomoImportNotice", { created: result.created, skipped: result.skipped }));
		} catch (error) {
			this.setStatus(t("settings.file.flomoImportFailed", { message: error instanceof Error ? error.message : String(error) }));
		}
		this.refreshImportButton();
	}

	private refreshImportButton(): void {
		if (this.importButton === null) return;
		this.importButton.toggleAttribute("disabled", this.selectedFile === null || this.preview === null || !normalizeVaultPath(this.targetFolder));
	}

	private setStatus(text: string): void { this.statusEl?.setText(text); }

	private getImportOptions(): FlomoImportOptions {
		return { skipAudioAttachments: this.skipAudioAttachments, skipImageAttachments: this.skipImageAttachments };
	}
}

function formatImportResult(result: FlomoImportResult): string {
	return t("settings.file.flomoImportComplete", {
		created: result.created,
		skipped: result.skipped,
		attachmentCount: result.attachmentCount,
		missingAttachmentCount: result.missingAttachmentCount,
		failedCount: result.failed.length,
	});
}
