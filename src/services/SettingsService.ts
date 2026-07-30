import type { Plugin } from "obsidian";

import { DEFAULT_KNOMO_SETTINGS } from "../settings/defaults";
import { cloneSettings, normalizeSettings } from "../settings/normalizeSettings";
import type { KnomoSettings } from "../types/settings";
import {
	buildPluginDataWithMaintenanceDiagnostic,
	buildPluginDataWithSettings,
	extractMaintenanceDiagnostic,
	extractSettingsData,
	type MaintenanceDiagnostic,
} from "../utils/pluginData";
import { PluginDataStore } from "./PluginDataStore";

export { DEFAULT_KNOMO_SETTINGS };

export class SettingsService {
	private settings = cloneSettings(DEFAULT_KNOMO_SETTINGS);
	private settingsWriteQueue: Promise<void> = Promise.resolve();

	constructor(
		plugin: Plugin,
		private readonly pluginDataStore = new PluginDataStore(plugin),
	) {}

	async loadSettings(): Promise<KnomoSettings> {
		const savedData = await this.pluginDataStore.read();
		this.settings = normalizeSettings(extractSettingsData(savedData));
		return this.getSettings();
	}

	getSettings(): KnomoSettings {
		return cloneSettings(this.settings);
	}

	async saveSettings(settings: KnomoSettings): Promise<KnomoSettings> {
		return this.runSettingsWriteExclusive(() => this.persistSettings(settings));
	}

	async updateSettings(patch: Partial<KnomoSettings>): Promise<KnomoSettings> {
		return this.runSettingsWriteExclusive(() => this.persistSettings({ ...this.settings, ...patch }));
	}

	async loadMaintenanceDiagnostic(): Promise<MaintenanceDiagnostic | null> {
		return extractMaintenanceDiagnostic(await this.pluginDataStore.read());
	}

	async saveMaintenanceDiagnostic(diagnostic: MaintenanceDiagnostic): Promise<void> {
		await this.runSettingsWriteExclusive(async () => {
			await this.pluginDataStore.mutate((savedData) => ({
				nextData: buildPluginDataWithMaintenanceDiagnostic(savedData, diagnostic),
				result: undefined,
			}));
		});
	}

	private async persistSettings(settings: KnomoSettings): Promise<KnomoSettings> {
		const nextSettings = normalizeSettings(settings);
		await this.pluginDataStore.mutate((savedData) => ({
			nextData: buildPluginDataWithSettings(savedData, nextSettings),
			result: undefined,
		}));
		this.settings = nextSettings;
		return this.getSettings();
	}

	private async runSettingsWriteExclusive<T>(operation: () => Promise<T>): Promise<T> {
		const previous = this.settingsWriteQueue;
		let releaseQueue: () => void = () => undefined;
		this.settingsWriteQueue = new Promise<void>((resolve) => { releaseQueue = resolve; });
		await previous;
		try {
			return await operation();
		} finally {
			releaseQueue();
		}
	}
}
