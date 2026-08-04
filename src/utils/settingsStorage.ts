import type { KnomoSettings } from "../types/settings";
import { isRecord } from "./object";

export type SharedKnomoSettings = Pick<KnomoSettings,
	"settingsVersion" | "memoFolders" | "defaultMemoFolder" | "memoCollapseLineThreshold" | "pinnedMemoLimit" | "timeBuoyEnabled"
>;

export type LocalKnomoSettings = Pick<KnomoSettings,
	"mobileCompactMode" | "desktopSidebarWidth" | "desktopSidebarCollapsed"
>;

const SHARED_SETTING_KEYS: readonly (keyof SharedKnomoSettings)[] = [
	"settingsVersion",
	"memoFolders",
	"defaultMemoFolder",
	"memoCollapseLineThreshold",
	"pinnedMemoLimit",
	"timeBuoyEnabled",
];

const LOCAL_SETTING_KEYS: readonly (keyof LocalKnomoSettings)[] = [
	"mobileCompactMode",
	"desktopSidebarWidth",
	"desktopSidebarCollapsed",
];

/** Returns only settings that belong in the synchronized Vault file. */
export function selectSharedSettings(settings: KnomoSettings): SharedKnomoSettings {
	return {
		settingsVersion: settings.settingsVersion,
		memoFolders: [...(settings.memoFolders ?? [])],
		defaultMemoFolder: settings.defaultMemoFolder ?? "",
		memoCollapseLineThreshold: settings.memoCollapseLineThreshold ?? 8,
		pinnedMemoLimit: settings.pinnedMemoLimit ?? 3,
		timeBuoyEnabled: settings.timeBuoyEnabled,
	};
}

/** Returns only settings that should remain local to one device. */
export function selectLocalSettings(settings: KnomoSettings): LocalKnomoSettings {
	return {
		mobileCompactMode: settings.mobileCompactMode,
		desktopSidebarWidth: settings.desktopSidebarWidth,
		desktopSidebarCollapsed: settings.desktopSidebarCollapsed,
	};
}

/** Extracts recognized shared fields from an arbitrary JSON value. */
export function extractSharedSettingsData(value: unknown): Record<string, unknown> {
	return selectKeys(value, SHARED_SETTING_KEYS);
}

/** Extracts recognized local fields from an arbitrary plugin-data value. */
export function extractLocalSettingsData(value: unknown): Record<string, unknown> {
	return isRecord(value) ? selectKeys(value.localSettings, LOCAL_SETTING_KEYS) : {};
}

/** Replaces local settings while preserving unrelated local plugin data. */
export function buildPluginDataWithLocalSettings(
	savedData: unknown,
	settings: LocalKnomoSettings,
): Record<string, unknown> {
	return Object.assign({}, isRecord(savedData) ? savedData : {}, { localSettings: settings });
}

/** Tests whether a patch contains at least one synchronized setting. */
export function hasSharedSettingsPatch(patch: Partial<KnomoSettings>): boolean {
	return SHARED_SETTING_KEYS.some((key) => key in patch);
}

/** Tests whether a patch contains at least one device-local setting. */
export function hasLocalSettingsPatch(patch: Partial<KnomoSettings>): boolean {
	return LOCAL_SETTING_KEYS.some((key) => key in patch);
}

/** Copies only known keys from a record. */
function selectKeys<T extends string>(value: unknown, keys: readonly T[]): Record<string, unknown> {
	if (!isRecord(value)) return {};
	const selected: Record<string, unknown> = {};
	for (const key of keys) if (key in value) selected[key] = value[key];
	return selected;
}
