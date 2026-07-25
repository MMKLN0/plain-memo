import { Notice, PluginSettingTab, Setting } from "obsidian";
import type { App, Plugin } from "obsidian";

import { t } from "../i18n";
import type { FileMemoOrchestrator } from "../services/FileMemoOrchestrator";
import type { ObsidianExcludeService } from "../services/ObsidianExcludeService";
import type { SettingsService } from "../services/SettingsService";
import { normalizeVaultPath } from "../utils/path";

/** Settings for the standalone file store; no legacy migration is performed. */
export class KnomoSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private readonly settings: SettingsService,
		private readonly store: FileMemoOrchestrator,
		_exclude: ObsidianExcludeService,
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

	private async commitCollapseThreshold(input: HTMLInputElement): Promise<void> {
		const parsed = Number(input.value);
		const threshold = Number.isFinite(parsed) ? Math.max(6, Math.floor(parsed)) : 8;
		input.value = String(threshold);
		await this.settings.updateSettings({ memoCollapseLineThreshold: threshold });
		await this.afterSettingsChanged();
	}

	private async afterSettingsChanged(): Promise<void> {
		this.store.invalidateAll();
		await this.onSettingsChanged();
	}
}
