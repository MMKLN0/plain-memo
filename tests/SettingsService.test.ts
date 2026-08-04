import test from "node:test";
import assert from "node:assert/strict";
import type { Plugin } from "obsidian";

import { SHARED_SETTINGS_PATH } from "../src/constants";
import { PluginDataStore } from "../src/services/PluginDataStore";
import { SettingsService } from "../src/services/SettingsService";
import type { VaultJsonMutation, VaultJsonStore } from "../src/services/VaultJsonStore";

test("ignores legacy shared settings in plugin data", async () => {
	const local = createPluginHarness({ settings: { memoFolders: ["Old"], defaultMemoFolder: "Old" } });
	const shared = createVaultHarness();
	const service = new SettingsService(shared.store, new PluginDataStore(local.plugin));

	const settings = await service.loadSettings();

	assert.deepEqual(settings.memoFolders, ["PlainMemo"]);
	assert.equal(settings.defaultMemoFolder, "PlainMemo");
});

test("combines synchronized Vault settings with device-local UI settings", async () => {
	const local = createPluginHarness({ localSettings: {
		mobileCompactMode: "off",
		desktopSidebarWidth: 360,
		desktopSidebarCollapsed: true,
	} });
	const shared = createVaultHarness({
		[SHARED_SETTINGS_PATH]: {
			memoFolders: ["Cards", "Imported"],
			defaultMemoFolder: "Cards",
			memoCollapseLineThreshold: 12,
			pinnedMemoLimit: 5,
			timeBuoyEnabled: false,
		},
	});
	const service = new SettingsService(shared.store, new PluginDataStore(local.plugin));

	const settings = await service.loadSettings();

	assert.deepEqual(settings.memoFolders, ["Cards", "Imported"]);
	assert.equal(settings.defaultMemoFolder, "Cards");
	assert.equal(settings.mobileCompactMode, "off");
	assert.equal(settings.desktopSidebarWidth, 360);
	assert.equal(settings.desktopSidebarCollapsed, true);
});

test("writes synchronized and local setting patches to separate stores", async () => {
	const local = createPluginHarness({ unrelated: "keep" });
	const shared = createVaultHarness();
	const service = new SettingsService(shared.store, new PluginDataStore(local.plugin));
	await service.loadSettings();

	await service.updateSettings({ memoFolders: ["PlainMemo", "Archive"], memoCollapseLineThreshold: 12 });
	await service.updateSettings({ desktopSidebarWidth: 320, desktopSidebarCollapsed: true });

	const synchronized = shared.read(SHARED_SETTINGS_PATH) as Record<string, unknown>;
	assert.deepEqual(synchronized.memoFolders, ["Archive", "PlainMemo"]);
	assert.equal(synchronized.memoCollapseLineThreshold, 12);
	assert.equal("desktopSidebarWidth" in synchronized, false);
	const localData = await local.read() as Record<string, unknown>;
	assert.equal(localData.unrelated, "keep");
	assert.deepEqual(localData.localSettings, {
		mobileCompactMode: "auto",
		desktopSidebarWidth: 320,
		desktopSidebarCollapsed: true,
	});
});

test("reloadIfChanged adopts externally synchronized scan folders", async () => {
	const local = createPluginHarness({});
	const shared = createVaultHarness();
	const service = new SettingsService(shared.store, new PluginDataStore(local.plugin));
	await service.loadSettings();
	shared.replace(SHARED_SETTINGS_PATH, { memoFolders: ["Synced"], defaultMemoFolder: "Synced" });

	assert.equal(await service.reloadIfChanged(), true);
	assert.deepEqual(service.getSettings().memoFolders, ["Synced"]);
	assert.equal(await service.reloadIfChanged(), false);
});

function createPluginHarness(initialData: unknown): { plugin: Plugin; read: () => Promise<unknown> } {
	let data = structuredClone(initialData);
	const plugin = {
		loadData: async () => structuredClone(data),
		saveData: async (nextData: unknown) => { data = structuredClone(nextData); },
	} as Plugin;
	return { plugin, read: async () => structuredClone(data) };
}

function createVaultHarness(initialData: Record<string, unknown> = {}): {
	store: VaultJsonStore;
	read: (path: string) => unknown;
	replace: (path: string, data: unknown) => void;
} {
	const files = new Map(Object.entries(structuredClone(initialData)));
	const store = {
		read: async (path: string) => structuredClone(files.get(path) ?? null),
		write: async (path: string, data: unknown) => { files.set(path, structuredClone(data)); },
		mutate: async <T>(path: string, mutation: (data: unknown | null) => VaultJsonMutation<T> | Promise<VaultJsonMutation<T>>) => {
			const result = await mutation(structuredClone(files.get(path) ?? null));
			if (result.nextData !== null) files.set(path, structuredClone(result.nextData));
			return result.result;
		},
	} as VaultJsonStore;
	return {
		store,
		read: (path) => structuredClone(files.get(path) ?? null),
		replace: (path, data) => { files.set(path, structuredClone(data)); },
	};
}
