export type DailyInsertPosition = "top" | "bottom";
export type MemoTimeFormat = "HH:mm:ss" | "HH:mm";
export type MonthlyDateOrder = "asc" | "desc";
export type ReferenceMode = "embed" | "link";
export type MobileCompactMode = "auto" | "on" | "off";

export interface KnomoSettings {
	settingsVersion: number;
	/** Vault-relative folders scanned recursively for standalone memo files. */
	memoFolders?: string[];
	/** The folder used when the composer creates a new memo. */
	defaultMemoFolder?: string;
	memoCollapseLineThreshold?: number;
	dailyHeading: string;
	dailyInsertPosition: DailyInsertPosition;
	memoTimeFormat: MemoTimeFormat;
	monthlyMemoFolder: string;
	monthlyMemoFileFormat: string;
	monthlyDateHeadingFormat: string;
	monthlyDateOrder: MonthlyDateOrder;
	legacyDailyHeadings: string[];
	timeBuoyEnabled: boolean;
	timeBuoyIntroDismissed?: boolean;
	mobileCompactMode: MobileCompactMode;
	syncDebounceMs: number;
	desktopSidebarWidth: number;
	desktopSidebarCollapsed: boolean;
	excludeMonthlyMemosFromObsidian: boolean;
	managedObsidianExcludeRule?: string;
	managedObsidianExcludeRuleOwned?: boolean;
	managedSystemFolderExcludeRule?: string;
	managedSystemFolderExcludeRuleOwned?: boolean;
	pinnedTags: string[];
}
