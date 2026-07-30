import { displayTooltip, Notice, PluginSettingTab, Setting } from "obsidian";
import type { App, Plugin } from "obsidian";

import { t } from "../i18n";
import type { FileMemoOrchestrator } from "../services/FileMemoOrchestrator";
import { FlomoImportService } from "../services/FlomoImportService";
import { MemoFilenameImportService } from "../services/MemoFilenameImportService";
import type { SettingsService } from "../services/SettingsService";
import type { PinnedMemoService } from "../services/PinnedMemoService";
import { normalizeVaultPath } from "../utils/path";
import { showKnomoConfirmModal } from "./KnomoConfirmModal";
import { FlomoImportModal } from "./FlomoImportModal";

/** Settings for the standalone file store; no legacy migration is performed. */
export class KnomoSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private readonly settings: SettingsService,
		private readonly store: FileMemoOrchestrator,
		private readonly pinnedMemos: PinnedMemoService,
		private readonly onSettingsChanged: () => Promise<void> = async () => undefined,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: t("settings.file.title") });
		containerEl.createEl("p", { text: t("settings.file.description") });
		this.renderFolders();

		let folderDraft = "";
		new Setting(containerEl)
			.setName(t("settings.file.addFolder"))
			.setDesc(t("settings.file.addFolderDescription"))
			.addText((text) => text.setPlaceholder("Memos").onChange((value) => { folderDraft = value; }))
			.addButton((button) => button.setButtonText(t("settings.file.add")).onClick(async () => {
				const folder = normalizeVaultPath(folderDraft);
				if (!folder) {
					new Notice(t("settings.file.folderRequired"));
					return;
				}
				const current = this.settings.getSettings();
				await this.settings.updateSettings({ memoFolders: [...(current.memoFolders ?? []), folder] });
				await this.afterSettingsChanged();
				this.display();
			}));

		new Setting(containerEl)
			.setName(t("settings.file.flomoImport"))
			.setDesc(t("settings.file.flomoImportDescription"))
			.addButton((button) => button.setButtonText(t("settings.file.flomoImportAction")).onClick(() => {
				this.openFlomoImport();
			}));

		const current = this.settings.getSettings();
		new Setting(containerEl)
			.setName(t("settings.file.defaultFolder"))
			.setDesc(t("settings.file.defaultFolderDescription"))
			.addDropdown((dropdown) => {
				dropdown.addOption("", t("settings.file.noDefaultFolder"));
				for (const folder of current.memoFolders ?? []) dropdown.addOption(folder, folder);
				dropdown.setValue(current.defaultMemoFolder ?? "");
				dropdown.onChange(async (defaultMemoFolder) => {
					await this.settings.updateSettings({ defaultMemoFolder });
					await this.afterSettingsChanged();
					this.display();
				});
			});

		new Setting(containerEl)
			.setName(t("settings.file.collapseThreshold"))
			.setDesc(t("settings.file.collapseThresholdDescription"))
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "6";
				text.inputEl.step = "1";
				text.setValue(String(current.memoCollapseLineThreshold ?? 8));
				text.onChange((value) => {
					const parsed = Number(value);
					if (Number.isFinite(parsed)) text.inputEl.dataset.validValue = String(Math.max(6, Math.floor(parsed)));
				});
				text.inputEl.addEventListener("blur", () => { void this.commitCollapseThreshold(text.inputEl); });
				text.inputEl.addEventListener("keydown", (event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						text.inputEl.blur();
					}
				});
			});

		new Setting(containerEl)
			.setName(t("settings.file.pinnedMemoLimit"))
			.setDesc(t("settings.file.pinnedMemoLimitDescription"))
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				text.inputEl.max = "20";
				text.inputEl.step = "1";
				text.setValue(String(current.pinnedMemoLimit ?? 3));
				text.inputEl.addEventListener("blur", () => { void this.commitPinnedMemoLimit(text.inputEl); });
				text.inputEl.addEventListener("keydown", (event) => { if (event.key === "Enter") text.inputEl.blur(); });
			});

		new Setting(containerEl)
			.setName(t("settings.file.mobileCompact"))
			.addDropdown((dropdown) => dropdown.addOptions({
				auto: t("settings.file.mobileAuto"),
				on: t("settings.file.mobileOn"),
				off: t("settings.file.mobileOff"),
			}).setValue(current.mobileCompactMode).onChange(async (mobileCompactMode) => {
				await this.settings.updateSettings({ mobileCompactMode: mobileCompactMode as "auto" | "on" | "off" });
				await this.afterSettingsChanged();
			}));

		new Setting(containerEl)
			.setName(t("settings.file.timeBuoy"))
			.setDesc(t("settings.file.timeBuoyDescription"))
			.addToggle((toggle) => toggle.setValue(current.timeBuoyEnabled).onChange(async (timeBuoyEnabled) => {
				await this.settings.updateSettings({ timeBuoyEnabled });
				await this.afterSettingsChanged();
			}));
	}

	private renderFolders(): void {
		const settings = this.settings.getSettings();
		const section = this.containerEl.createDiv({ cls: "knomo-settings-folders" });
		if ((settings.memoFolders ?? []).length === 0) {
			section.createEl("p", { text: t("settings.file.noFolders") });
			return;
		}
		for (const folder of settings.memoFolders ?? []) {
			new Setting(section)
				.setName(folder)
				.setDesc(folder === settings.defaultMemoFolder
					? t("settings.file.defaultFolderBadge")
					: t("settings.file.recursive"))
				.addExtraButton((button) => {
					const tooltip = t("settings.file.importFolderTooltip");
					button.setIcon("import").onClick(() => { void this.importFolderFilenames(folder); });
					button.extraSettingsEl.setAttr("aria-label", tooltip);
					button.extraSettingsEl.addEventListener("pointerenter", () => {
						displayTooltip(button.extraSettingsEl, tooltip, { delay: 0 });
					});
				})
				.addExtraButton((button) => button.setIcon("trash").setTooltip(t("settings.file.removeFolder")).onClick(async () => {
					const current = this.settings.getSettings();
					await this.settings.updateSettings({
						memoFolders: (current.memoFolders ?? []).filter((item) => item !== folder),
						defaultMemoFolder: current.defaultMemoFolder === folder ? "" : current.defaultMemoFolder,
					});
					await this.afterSettingsChanged();
					this.display();
				}));
		}
	}

	private openFlomoImport(): void {
		const service = new FlomoImportService(this.app);
		new FlomoImportModal(this.app, {
			defaultFolder: this.settings.getSettings().defaultMemoFolder ?? "",
			onPreview: (file, options) => service.preview(file, options),
			onImport: async (file, folder, options) => {
				const result = await service.import(file, folder, options);
				this.store.invalidateAll();
				await this.onSettingsChanged();
				return result;
			},
			onEnsureScannedFolder: async (folder) => {
				const current = this.settings.getSettings();
				if (!(current.memoFolders ?? []).includes(folder)) {
					await this.settings.updateSettings({ memoFolders: [...(current.memoFolders ?? []), folder] });
					await this.afterSettingsChanged();
				}
			},
		}).open();
	}

	private async importFolderFilenames(folder: string): Promise<void> {
		const service = new MemoFilenameImportService(this.app);
		const plan = service.plan(folder);
		if (plan.files.length === 0) {
			new Notice(t("settings.file.importFolderNothingToDo"));
			return;
		}
		const confirmed = await showKnomoConfirmModal(this.app, {
			title: t("settings.file.importFolderTitle"),
			message: t("settings.file.importFolderConfirm", { count: plan.files.length, skipped: plan.skipped }),
			confirmLabel: t("settings.file.importFolderAction"),
		});
		if (!confirmed) return;
		const result = await service.importFolder(folder);
		this.store.invalidateAll();
		await this.onSettingsChanged();
		new Notice(t("settings.file.importFolderComplete", { renamed: result.renamed, skipped: result.skipped, failed: result.failed.length }));
	}

	private async commitCollapseThreshold(input: HTMLInputElement): Promise<void> {
		const parsed = Number(input.value);
		const threshold = Number.isFinite(parsed) ? Math.max(6, Math.floor(parsed)) : 8;
		input.value = String(threshold);
		await this.settings.updateSettings({ memoCollapseLineThreshold: threshold });
		await this.afterSettingsChanged();
	}

	private async commitPinnedMemoLimit(input: HTMLInputElement): Promise<void> {
		const parsed = Number(input.value);
		const limit = Math.min(20, Math.max(1, Number.isFinite(parsed) ? Math.floor(parsed) : 3));
		const pinnedCount = this.pinnedMemos.getSnapshot().paths.length;
		if (limit < pinnedCount) {
			input.value = String(this.settings.getSettings().pinnedMemoLimit ?? 3);
			new Notice(t("settings.file.pinnedMemoLimitTooLow", { count: pinnedCount }));
			return;
		}
		input.value = String(limit);
		await this.settings.updateSettings({ pinnedMemoLimit: limit });
		await this.afterSettingsChanged();
	}

	private async afterSettingsChanged(): Promise<void> {
		this.store.invalidateAll();
		await this.onSettingsChanged();
	}
}
