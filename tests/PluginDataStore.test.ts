import test from "node:test";
import assert from "node:assert/strict";

import { RANDOM_REUNION_STATE_PATH, SHUFFLE_DAY_STATE_PATH } from "../src/constants";
import { RandomReunionService } from "../src/services/RandomReunionService";
import { ShuffleDayService } from "../src/services/ShuffleDayService";
import type { VaultJsonMutation, VaultJsonStore } from "../src/services/VaultJsonStore";
import type { MemoRecord } from "../src/types/memo";
import { isRecord } from "../src/utils/object";
import {
	normalizeRandomReunionReviewStates,
	normalizeSharedShuffleDayHistory,
} from "../src/utils/pluginData";

test("concurrent review mutations preserve every update", async () => {
	const harness = createVaultHarness();
	const service = new RandomReunionService(harness.store);

	await Promise.all([
		service.markRandomReunionReviewed("memo-a"),
		service.markRandomReunionReviewed("memo-a"),
		service.markRandomReunionReviewed("memo-b"),
	]);

	const states = normalizeRandomReunionReviewStates(await harness.store.read(RANDOM_REUNION_STATE_PATH));
	assert.equal(states["memo-a"]?.reviewCount, 2);
	assert.equal(states["memo-b"]?.reviewCount, 1);
});

test("separate Vault files preserve review state and shuffle history", async () => {
	const harness = createVaultHarness();
	const randomReunionService = new RandomReunionService(harness.store);
	const shuffleDayService = new ShuffleDayService(harness.store);

	const [, shuffleResult] = await Promise.all([
		randomReunionService.markRandomReunionReviewed("memo-a"),
		shuffleDayService.selectShuffleDay([createMemo("old-memo", "2020-01-02T09:00:00")]),
	]);

	assert.equal(shuffleResult.status, "ready");
	assert.equal(normalizeRandomReunionReviewStates(await harness.store.read(RANDOM_REUNION_STATE_PATH))["memo-a"]?.reviewCount, 1);
	assert.equal(normalizeSharedShuffleDayHistory(await harness.store.read(SHUFFLE_DAY_STATE_PATH)).length, 1);
});

test("failed Vault data save releases the next mutation", async () => {
	const harness = createVaultHarness();
	harness.failNextSave();

	await assert.rejects(
		harness.store.mutate("test.json", (savedData) => ({
			nextData: Object.assign({}, isRecord(savedData) ? savedData : {}, { failed: true }),
			result: undefined,
		})),
		/save failed/,
	);
	await harness.store.mutate("test.json", (savedData) => ({
		nextData: Object.assign({}, isRecord(savedData) ? savedData : {}, { saved: true }),
		result: undefined,
	}));

	const savedData = await harness.store.read("test.json");
	assert.equal(isRecord(savedData) ? savedData.saved : undefined, true);
});

function createVaultHarness(): { store: VaultJsonStore; failNextSave: () => void } {
	const files = new Map<string, unknown>();
	let shouldFailNextSave = false;
	let queue: Promise<void> = Promise.resolve();
	const store = {
		read: async (path: string) => cloneData(files.get(path) ?? null),
		mutate: async <T>(path: string, mutation: (data: unknown | null) => VaultJsonMutation<T> | Promise<VaultJsonMutation<T>>) => {
			const previous = queue;
			let release: () => void = () => undefined;
			queue = new Promise<void>((resolve) => { release = resolve; });
			await previous;
			try {
				const result = await mutation(cloneData(files.get(path) ?? null));
				if (result.nextData === null) return result.result;
				if (shouldFailNextSave) {
					shouldFailNextSave = false;
					throw new Error("save failed");
				}
				files.set(path, cloneData(result.nextData));
				return result.result;
			} finally {
				release();
			}
		},
	} as VaultJsonStore;
	return {
		store,
		failNextSave: () => { shouldFailNextSave = true; },
	};
}

function cloneData<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function createMemo(id: string, createdAt: string): MemoRecord {
	return {
		id,
		createdAt,
		updatedAt: createdAt,
		contentSnapshot: id,
		contentHash: `hash-${id}`,
		status: "active",
		syncStatus: "synced",
		source: "plugin_input",
		version: 1,
		tags: [],
		links: [],
		images: [],
		references: [],
		sourceMemoId: null,
		issue: null,
		lastMarkdownSyncAt: null,
		lastMarkdownSyncSource: null,
		dailyRef: {
			path: `Daily/${createdAt.slice(0, 10)}.md`,
			heading: "## Memos",
			lastKnownBlock: id,
			lastKnownHash: `daily-${id}`,
			lineNumberHint: 1,
			lastSyncedAt: null,
		},
		monthlyRef: {
			path: "Memos/Memos-2020-01.md",
			dateHeading: `## ${createdAt.slice(0, 10)}`,
			lastKnownBlock: id,
			lastKnownHash: `monthly-${id}`,
			lineNumberHint: 1,
			lastSyncedAt: null,
		},
	};
}
