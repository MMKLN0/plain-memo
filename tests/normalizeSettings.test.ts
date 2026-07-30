import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_KNOMO_SETTINGS, normalizeSettings } from "../src/settings/normalizeSettings";

test("normalizes the current standalone memo settings", () => {
	const settings = normalizeSettings({
		memoFolders: [" Cards ", "Cards/child", "Archive", "Archive"],
		defaultMemoFolder: "Cards",
		memoCollapseLineThreshold: 3,
		pinnedMemoLimit: 99,
		timeBuoyEnabled: false,
		mobileCompactMode: "on",
		desktopSidebarWidth: 420,
		desktopSidebarCollapsed: true,
	});

	assert.deepEqual(settings.memoFolders, ["Archive", "Cards"]);
	assert.equal(settings.defaultMemoFolder, "Cards");
	assert.equal(settings.memoCollapseLineThreshold, 6);
	assert.equal(settings.pinnedMemoLimit, 20);
	assert.equal(settings.timeBuoyEnabled, false);
	assert.equal(settings.mobileCompactMode, "on");
	assert.equal(settings.desktopSidebarWidth, 420);
	assert.equal(settings.desktopSidebarCollapsed, true);
});

test("uses current defaults for invalid or missing values", () => {
	const settings = normalizeSettings({
		memoCollapseLineThreshold: Number.NaN,
		pinnedMemoLimit: "invalid",
		mobileCompactMode: "invalid",
	});

	assert.deepEqual(settings.memoFolders, DEFAULT_KNOMO_SETTINGS.memoFolders);
	assert.equal(settings.defaultMemoFolder, DEFAULT_KNOMO_SETTINGS.defaultMemoFolder);
	assert.equal(settings.memoCollapseLineThreshold, DEFAULT_KNOMO_SETTINGS.memoCollapseLineThreshold);
	assert.equal(settings.pinnedMemoLimit, DEFAULT_KNOMO_SETTINGS.pinnedMemoLimit);
	assert.equal(settings.timeBuoyEnabled, true);
	assert.equal(settings.mobileCompactMode, "auto");
});

test("adds the write folder to the scan roots and removes nested roots", () => {
	const settings = normalizeSettings({
		memoFolders: ["Archive/old", "Cards"],
		defaultMemoFolder: "Archive",
	});

	assert.deepEqual(settings.memoFolders, ["Archive", "Cards"]);
});
