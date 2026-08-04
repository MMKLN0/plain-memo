import { isRecord } from "./object";

const PINNED_SECTION_COLLAPSED_KEY = "pinnedSectionCollapsed";

/** Reads the device-local pinned-section expansion state. */
export function extractPinnedSectionCollapsed(savedData: unknown): boolean {
	return isRecord(savedData) && savedData[PINNED_SECTION_COLLAPSED_KEY] === true;
}

/** Replaces the device-local pinned-section expansion state. */
export function buildPluginDataWithPinnedSectionCollapsed(
	savedData: unknown,
	collapsed: boolean,
): Record<string, unknown> {
	return Object.assign({}, isRecord(savedData) ? savedData : {}, {
		[PINNED_SECTION_COLLAPSED_KEY]: collapsed,
	});
}
