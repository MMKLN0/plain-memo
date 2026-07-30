import test from "node:test";
import assert from "node:assert/strict";
import type { Plugin } from "obsidian";

import { PluginDataStore } from "../src/services/PluginDataStore";
import { SettingsService } from "../src/services/SettingsService";
import { extractSettingsData } from "../src/utils/pluginData";

test("loads current settings while dropping obsolete storage fields", async () => {
	const harness = createPluginHarness({ settings: {
		memoFolders: ["Cards"],
		defaultMemoFolder: "Cards",
		dailyHeading: "Memos",
		monthlyMemoFolder: "Monthly",
		timeBuoyEnabled: false,
	} });
	const service = new SettingsService(harness.plugin, new PluginDataStore(harness.plugin));

	const settings = await service.loadSettings();

	assert.deepEqual(settings.memoFolders, ["Cards"]);
	assert.equal(settings.defaultMemoFolder, "Cards");
	assert.equal(settings.timeBuoyEnabled, false);
	assert.equal("dailyHeading" in settings, false);
	assert.equal("monthlyMemoFolder" in settings, false);
});

test("saving settings preserves unrelated plugin data", async () => {
	const harness = createPluginHarness({ settings: {}, pinnedMemos: { paths: ["Cards/a.md"] } });
	const service = new SettingsService(harness.plugin, new PluginDataStore(harness.plugin));
	await service.loadSettings();

	await service.updateSettings({ memoCollapseLineThreshold: 12, timeBuoyEnabled: false });

	const saved = await harness.read();
	assert.deepEqual((saved as { pinnedMemos: unknown }).pinnedMemos, { paths: ["Cards/a.md"] });
	const settings = extractSettingsData(saved) as Record<string, unknown>;
	assert.equal(settings.memoCollapseLineThreshold, 12);
	assert.equal(settings.timeBuoyEnabled, false);
});

function createPluginHarness(initialData: unknown): { plugin: Plugin; read: () => Promise<unknown> } {
	let data = structuredClone(initialData);
	const plugin = {
		loadData: async () => structuredClone(data),
		saveData: async (nextData: unknown) => { data = structuredClone(nextData); },
	} as Plugin;
	return { plugin, read: async () => structuredClone(data) };
}
