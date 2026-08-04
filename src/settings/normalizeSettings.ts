import { SETTINGS_VERSION } from "../constants";
import type { KnomoSettings, MobileCompactMode } from "../types/settings";
import { isRecord } from "../utils/object";
import { normalizeVaultPath } from "../utils/path";
import { DEFAULT_KNOMO_SETTINGS } from "./defaults";

export { DEFAULT_KNOMO_SETTINGS } from "./defaults";

function isMobileCompactMode(value: unknown): value is MobileCompactMode {
	return value === "auto" || value === "on" || value === "off";
}

function numberOrDefault(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

export function normalizeSettings(value: unknown): KnomoSettings {
	const saved = isRecord(value) ? value : {};
	const defaultMemoFolder = normalizeVaultPath(
		typeof saved.defaultMemoFolder === "string"
			? saved.defaultMemoFolder
			: DEFAULT_KNOMO_SETTINGS.defaultMemoFolder ?? "",
	);
	const memoFolders = normalizeMemoFolders([
		...(Array.isArray(saved.memoFolders) ? saved.memoFolders : DEFAULT_KNOMO_SETTINGS.memoFolders ?? []),
		...(defaultMemoFolder ? [defaultMemoFolder] : []),
	]);
	return {
		settingsVersion: SETTINGS_VERSION,
		memoFolders,
		defaultMemoFolder,
		memoCollapseLineThreshold: Math.max(6, Math.floor(numberOrDefault(
			saved.memoCollapseLineThreshold,
			DEFAULT_KNOMO_SETTINGS.memoCollapseLineThreshold ?? 8,
		))),
		pinnedMemoLimit: Math.min(20, Math.max(1, Math.floor(numberOrDefault(
			saved.pinnedMemoLimit,
			DEFAULT_KNOMO_SETTINGS.pinnedMemoLimit ?? 5,
		)))),
		timeBuoyEnabled: booleanOrDefault(saved.timeBuoyEnabled, DEFAULT_KNOMO_SETTINGS.timeBuoyEnabled),
		mobileCompactMode: isMobileCompactMode(saved.mobileCompactMode)
			? saved.mobileCompactMode
			: DEFAULT_KNOMO_SETTINGS.mobileCompactMode,
		desktopSidebarWidth: numberOrDefault(
			saved.desktopSidebarWidth,
			DEFAULT_KNOMO_SETTINGS.desktopSidebarWidth,
		),
		desktopSidebarCollapsed: booleanOrDefault(
			saved.desktopSidebarCollapsed,
			DEFAULT_KNOMO_SETTINGS.desktopSidebarCollapsed,
		),
	};
}

export function cloneSettings(settings: KnomoSettings): KnomoSettings {
	return { ...settings, memoFolders: [...(settings.memoFolders ?? [])] };
}

function normalizeMemoFolders(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const folders = [...new Set(value
		.filter((item): item is string => typeof item === "string")
		.map((item) => normalizeVaultPath(item))
		.filter(Boolean))].sort();
	return folders.filter((folder) => !folders.some((candidate) => (
		candidate !== folder && folder.startsWith(`${candidate}/`)
	)));
}
