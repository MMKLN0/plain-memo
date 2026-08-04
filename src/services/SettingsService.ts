import { SHARED_SETTINGS_PATH } from "../constants";
import { DEFAULT_KNOMO_SETTINGS } from "../settings/defaults";
import { cloneSettings, normalizeSettings } from "../settings/normalizeSettings";
import type { KnomoSettings } from "../types/settings";
import {
	buildPluginDataWithMaintenanceDiagnostic,
	extractMaintenanceDiagnostic,
	type MaintenanceDiagnostic,
} from "../utils/pluginData";
import {
	buildPluginDataWithLocalSettings,
	extractLocalSettingsData,
	extractSharedSettingsData,
	hasLocalSettingsPatch,
	hasSharedSettingsPatch,
	selectLocalSettings,
	selectSharedSettings,
} from "../utils/settingsStorage";
import type { PluginDataStore } from "./PluginDataStore";
import type { VaultJsonStore } from "./VaultJsonStore";

export { DEFAULT_KNOMO_SETTINGS };

export class SettingsService {
	private settings = cloneSettings(DEFAULT_KNOMO_SETTINGS);
	private settingsWriteQueue: Promise<void> = Promise.resolve();

	constructor(
		private readonly vaultDataStore: VaultJsonStore,
		private readonly pluginDataStore: PluginDataStore,
	) {}

	async loadSettings(): Promise<KnomoSettings> {
		const [sharedData, localData] = await Promise.all([
			this.vaultDataStore.read(SHARED_SETTINGS_PATH),
			this.pluginDataStore.read(),
		]);
		this.settings = normalizeSettings({
			...extractSharedSettingsData(sharedData),
			...extractLocalSettingsData(localData),
		});
		return this.getSettings();
	}

	getSettings(): KnomoSettings {
		return cloneSettings(this.settings);
	}

	async saveSettings(settings: KnomoSettings): Promise<KnomoSettings> {
		return this.runSettingsWriteExclusive(async () => {
			const normalized = normalizeSettings(settings);
			await Promise.all([
				this.vaultDataStore.write(SHARED_SETTINGS_PATH, selectSharedSettings(normalized)),
				this.pluginDataStore.mutate((savedData) => ({
					nextData: buildPluginDataWithLocalSettings(savedData, selectLocalSettings(normalized)),
					result: undefined,
				})),
			]);
			this.settings = normalized;
			return this.getSettings();
		});
	}

	async updateSettings(patch: Partial<KnomoSettings>): Promise<KnomoSettings> {
		return this.runSettingsWriteExclusive(async () => {
			if (hasSharedSettingsPatch(patch)) {
				await this.vaultDataStore.mutate(SHARED_SETTINGS_PATH, (savedData) => {
					const normalized = normalizeSettings({
						...extractSharedSettingsData(savedData),
						...selectLocalSettings(this.settings),
						...patch,
					});
					return { nextData: selectSharedSettings(normalized), result: undefined };
				});
			}
			if (hasLocalSettingsPatch(patch)) {
				await this.pluginDataStore.mutate((savedData) => {
					const normalized = normalizeSettings({
						...selectSharedSettings(this.settings),
						...extractLocalSettingsData(savedData),
						...patch,
					});
					return {
						nextData: buildPluginDataWithLocalSettings(savedData, selectLocalSettings(normalized)),
						result: undefined,
					};
				});
			}
			return this.loadSettings();
		});
	}

	/** Reloads settings after another device changes the shared file. */
	async reloadIfChanged(): Promise<boolean> {
		const previous = this.getSettings();
		const next = await this.loadSettings();
		return JSON.stringify(previous) !== JSON.stringify(next);
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

	/** Serializes setting updates from the settings tab and view layout. */
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
