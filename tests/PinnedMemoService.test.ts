import test from "node:test";
import assert from "node:assert/strict";

import { PINNED_MEMOS_FOLDER } from "../src/constants";
import { PinnedMemoService } from "../src/services/PinnedMemoService";
import type { PluginDataStore, PluginDataMutation } from "../src/services/PluginDataStore";
import type { VaultJsonMutation, VaultJsonStore } from "../src/services/VaultJsonStore";

test("stores every pinned memo in a separate synchronized marker", async () => {
	const harness = createHarness();
	const service = new PinnedMemoService(harness.vaultStore, harness.localStore);
	await service.load();

	assert.equal(await service.pin("Cards/a.md", 3), true);
	assert.equal(await service.pin("Cards/b.md", 3), true);

	assert.deepEqual(new Set(service.getSnapshot().paths), new Set(["Cards/a.md", "Cards/b.md"]));
	assert.equal(harness.sharedFiles().length, 2);
	assert.ok(harness.sharedFiles().every((path) => path.startsWith(`${PINNED_MEMOS_FOLDER}/`)));
});

test("keeps pinned-section collapsed state in local plugin data", async () => {
	const harness = createHarness();
	const service = new PinnedMemoService(harness.vaultStore, harness.localStore);
	await service.load();

	await service.setCollapsed(true);

	assert.equal(service.getSnapshot().collapsed, true);
	assert.equal((harness.localData() as Record<string, unknown>).pinnedSectionCollapsed, true);
	assert.equal(harness.sharedFiles().length, 0);
});

test("ignores legacy pinnedMemos plugin data", async () => {
	const harness = createHarness({ pinnedMemos: { paths: ["Old/a.md"], collapsed: true } });
	const service = new PinnedMemoService(harness.vaultStore, harness.localStore);
	await service.load();

	assert.deepEqual(service.getSnapshot(), { paths: [], collapsed: false });
});

test("reloadIfChanged adopts externally synchronized marker files", async () => {
	const harness = createHarness();
	const service = new PinnedMemoService(harness.vaultStore, harness.localStore);
	await service.load();
	harness.replaceShared(`${PINNED_MEMOS_FOLDER}/remote.json`, {
		path: "Cards/remote.md",
		pinnedAt: "2026-08-04T12:00:00.000Z",
	});

	assert.equal(await service.reloadIfChanged(), true);
	assert.deepEqual(service.getSnapshot().paths, ["Cards/remote.md"]);
	assert.equal(await service.reloadIfChanged(), false);
});

test("unpin removes only markers for the selected memo", async () => {
	const harness = createHarness();
	const service = new PinnedMemoService(harness.vaultStore, harness.localStore);
	await service.load();
	await service.pin("Cards/a.md", 3);
	await service.pin("Cards/b.md", 3);

	await service.unpin("Cards/a.md");

	assert.deepEqual(service.getSnapshot().paths, ["Cards/b.md"]);
	assert.equal(harness.sharedFiles().length, 2);
	const records = harness.sharedData() as Record<string, { path: string; pinned: boolean }>;
	assert.equal(Object.values(records).find((record) => record.path === "Cards/a.md")?.pinned, false);
});

test("removes unpinned markers only after the fifteen-day retention period", async () => {
	const now = new Date("2026-08-04T12:00:00.000Z");
	const harness = createHarness();
	harness.replaceShared(`${PINNED_MEMOS_FOLDER}/expired.json`, {
		path: "Cards/expired.md",
		pinnedAt: "2026-07-01T12:00:00.000Z",
		updatedAt: "2026-07-20T11:59:59.999Z",
		pinned: false,
	});
	harness.replaceShared(`${PINNED_MEMOS_FOLDER}/boundary.json`, {
		path: "Cards/boundary.md",
		pinnedAt: "2026-07-01T12:00:00.000Z",
		updatedAt: "2026-07-20T12:00:00.000Z",
		pinned: false,
	});
	harness.replaceShared(`${PINNED_MEMOS_FOLDER}/active.json`, {
		path: "Cards/active.md",
		pinnedAt: "2026-07-01T12:00:00.000Z",
		updatedAt: "2026-07-01T12:00:00.000Z",
		pinned: true,
	});
	const service = new PinnedMemoService(harness.vaultStore, harness.localStore, () => now);

	await service.load();

	assert.deepEqual(harness.sharedFiles(), [
		`${PINNED_MEMOS_FOLDER}/active.json`,
		`${PINNED_MEMOS_FOLDER}/boundary.json`,
	]);
	assert.deepEqual(service.getSnapshot().paths, ["Cards/active.md"]);
});

test("does not delete a marker that was repinned while cleanup was waiting", async () => {
	const now = new Date("2026-08-04T12:00:00.000Z");
	const harness = createHarness();
	const markerPath = `${PINNED_MEMOS_FOLDER}/repinned.json`;
	harness.replaceShared(markerPath, {
		path: "Cards/a.md",
		pinnedAt: "2026-07-01T12:00:00.000Z",
		updatedAt: "2026-07-01T12:00:00.000Z",
		pinned: false,
	});
	harness.beforeDeleteIf(() => {
		harness.replaceShared(markerPath, {
			path: "Cards/a.md",
			pinnedAt: "2026-08-04T12:00:00.000Z",
			updatedAt: "2026-08-04T12:00:00.000Z",
			pinned: true,
		});
	});
	const service = new PinnedMemoService(harness.vaultStore, harness.localStore, () => now);

	await service.load();

	assert.deepEqual(harness.sharedFiles(), [markerPath]);
	assert.deepEqual(service.getSnapshot().paths, ["Cards/a.md"]);
});

function createHarness(initialLocalData: unknown = {}) {
	let localData = structuredClone(initialLocalData);
	const shared = new Map<string, unknown>();
	let beforeDeleteIf: (() => void) | null = null;
	const localStore = {
		read: async () => structuredClone(localData),
		mutate: async <T>(mutation: (savedData: unknown) => PluginDataMutation<T> | Promise<PluginDataMutation<T>>) => {
			const result = await mutation(structuredClone(localData));
			if (result.nextData !== null) localData = structuredClone(result.nextData);
			return result.result;
		},
	} as PluginDataStore;
	const vaultStore = {
		read: async (path: string) => structuredClone(shared.get(path) ?? null),
		write: async (path: string, data: unknown) => { shared.set(path, structuredClone(data)); },
		list: async (folder: string) => [...shared.keys()].filter((path) => path.startsWith(`${folder}/`)).sort(),
		deleteIf: async (path: string, predicate: (savedData: unknown | null) => boolean | Promise<boolean>) => {
			beforeDeleteIf?.();
			beforeDeleteIf = null;
			if (!await predicate(structuredClone(shared.get(path) ?? null))) return false;
			return shared.delete(path);
		},
	} as VaultJsonStore;
	return {
		localStore,
		vaultStore,
		localData: () => structuredClone(localData),
		sharedFiles: () => [...shared.keys()].sort(),
		sharedData: () => Object.fromEntries([...shared.entries()].map(([path, data]) => [path, structuredClone(data)])),
		replaceShared: (path: string, data: unknown) => { shared.set(path, structuredClone(data)); },
		beforeDeleteIf: (callback: () => void) => { beforeDeleteIf = callback; },
	};
}
