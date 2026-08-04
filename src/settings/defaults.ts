import {
	DEFAULT_DESKTOP_SIDEBAR_WIDTH,
	DEFAULT_MEMO_FOLDER,
	SETTINGS_VERSION,
} from "../constants";
import type { KnomoSettings } from "../types/settings";

export const DEFAULT_KNOMO_SETTINGS: KnomoSettings = {
	settingsVersion: SETTINGS_VERSION,
	memoFolders: [DEFAULT_MEMO_FOLDER],
	defaultMemoFolder: DEFAULT_MEMO_FOLDER,
	memoCollapseLineThreshold: 8,
	pinnedMemoLimit: 5,
	timeBuoyEnabled: true,
	mobileCompactMode: "auto",
	desktopSidebarWidth: DEFAULT_DESKTOP_SIDEBAR_WIDTH,
	desktopSidebarCollapsed: false,
};
