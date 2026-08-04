export type DailyInsertPosition = "top" | "bottom";
export type ReferenceMode = "embed" | "link";
export type MobileCompactMode = "auto" | "on" | "off";

export interface KnomoSettings {
	settingsVersion: number;
	/** Vault-relative folders scanned recursively for standalone memo files. */
	memoFolders?: string[];
	/** The folder used when the composer creates a new memo. */
	defaultMemoFolder?: string;
	memoCollapseLineThreshold?: number;
	pinnedMemoLimit?: number;
	trashRetentionDays?: number;
	timeBuoyEnabled: boolean;
	mobileCompactMode: MobileCompactMode;
	desktopSidebarWidth: number;
	desktopSidebarCollapsed: boolean;
}
