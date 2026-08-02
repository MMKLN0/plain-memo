import test from "node:test";
import assert from "node:assert/strict";

import { PinnedMemoService } from "../src/services/PinnedMemoService";
import type { PluginDataStore, PluginDataMutation } from "../src/services/PluginDataStore";

test("unpin removes an existing pinned memo and persists the change", async () => {
	const harness = createStore({ pinnedMemos: { paths: ["Cards/a.md", "Cards/b.md"], collapsed: false } });
	const service = new PinnedMemoService(harness.store);
	await service.load();

	await service.unpin("Cards/a.md");

	assert.deepEqual(service.getSnapshot().paths, ["Cards/b.md"]);
	assert.deepEqual((harness.read() as { pinnedMemos: { paths: string[] } }).pinnedMemos.paths, ["Cards/b.md"]);
});

test("unpin ignores a path that is not pinned without writing plugin data", async () => {
	const harness = createStore({ pinnedMemos: { paths: ["Cards/a.md"], collapsed: false } });
	const service = new PinnedMemoService(harness.store);
	await service.load();

	await service.unpin("Cards/missing.md");

	assert.equal(harness.writes(), 0);
	assert.deepEqual(service.getSnapshot().paths, ["Cards/a.md"]);
});

test("reloadIfChanged adopts externally synchronized pinned memo data", async () => {
	const harness = createStore({ pinnedMemos: { paths: ["Cards/a.md"], collapsed: false } });
	const service = new PinnedMemoService(harness.store);
	await service.load();

	harness.replace({ pinnedMemos: { paths: ["Cards/b.md"], collapsed: true } });

	assert.equal(await service.reloadIfChanged(), true);
	assert.deepEqual(service.getSnapshot(), { paths: ["Cards/b.md"], collapsed: true });
	assert.equal(await service.reloadIfChanged(), false);
});

function createStore(initialData: unknown): {
	store: PluginDataStore;
	read: () => unknown;
	writes: () => number;
	replace: (nextData: unknown) => void;
} {
	let data = structuredClone(initialData);
	let writeCount = 0;
	const store = {
		read: async () => structuredClone(data),
		mutate: async <T>(mutation: (savedData: unknown) => PluginDataMutation<T> | Promise<PluginDataMutation<T>>) => {
			const result = await mutation(structuredClone(data));
			if (result.nextData !== null) {
				data = structuredClone(result.nextData);
				writeCount += 1;
			}
			return result.result;
		},
	} as PluginDataStore;
	return {
		store,
		read: () => structuredClone(data),
		writes: () => writeCount,
		replace: (nextData) => { data = structuredClone(nextData); },
	};
}
