import test from "node:test";
import assert from "node:assert/strict";

import type { MemoLoadPage } from "../src/services/FileMemoOrchestrator";
import type { MemoRecord } from "../src/types/memo";
import { MobileMemoHydrator } from "../src/ui/MobileMemoHydrator";
import type { MobileMemoHydrationRenderState } from "../src/ui/MobileMemoHydrator";

test("schedules background hydration after the initial count-based load", () => {
	const harness = createHarness(250);
	harness.hydrator.setInitialLoadSuccess(harness.plan, 50);
	harness.hydrator.schedule();
	harness.hydrator.schedule();

	assert.equal(harness.hydrator.getSnapshot().allMemosLoaded, false);
	assert.equal(harness.hydrator.getSnapshot().loadedMemoCount, 50);
	assert.equal(harness.hydrator.getSnapshot().totalMemoCount, 250);
	assert.deepEqual(harness.scheduler.pendingDelays(), [1200]);

	harness.scheduler.runNext();
	assert.equal(harness.beginCalls(), 1);
});

test("hydrates fixed-size batches independent of memo dates", async () => {
	const harness = createHarness(251);
	harness.hydrator.setInitialLoadSuccess(harness.plan, 50);

	const hydration = harness.hydrator.start(false);
	for (let index = 0; index < 3; index += 1) await harness.scheduler.runNextAndFlush();

	assert.equal(await hydration, true);
	assert.deepEqual(harness.pageRequests, [
		{ offset: 50, limit: 100 },
		{ offset: 150, limit: 100 },
		{ offset: 250, limit: 100 },
	]);
	assert.equal(harness.batchStates.length, 2);
	assert.equal(harness.completedCalls(), 1);
	assert.equal(harness.hydrator.getSnapshot().loadedMemoCount, 251);
	assert.equal(harness.hydrator.getSnapshot().allMemosLoaded, true);
});

test("fast mode removes the delay between count batches", async () => {
	const harness = createHarness(220);
	harness.hydrator.setInitialLoadSuccess(harness.plan, 20);
	const hydration = harness.hydrator.start(true);

	assert.deepEqual(harness.scheduler.pendingDelays(), [0]);
	await harness.scheduler.runNextAndFlush();
	assert.deepEqual(harness.scheduler.pendingDelays(), [0]);
	await harness.scheduler.runNextAndFlush();
	assert.equal(await hydration, true);
});

test("card-flow and sidebar requests accelerate remaining batches", async () => {
	const cardHarness = createHarness(150);
	cardHarness.hydrator.setInitialLoadSuccess(cardHarness.plan, 50);
	cardHarness.hydrator.requestCardFlowHydration();
	assert.equal(cardHarness.hydrator.getSnapshot().fastMode, true);
	assert.equal(cardHarness.hydrator.getSnapshot().renderNextBatchAfterHydration, true);
	assert.equal(cardHarness.ensureCalls(), 1);

	const sidebarHarness = createHarness(150);
	sidebarHarness.hydrator.setInitialLoadSuccess(sidebarHarness.plan, 50);
	sidebarHarness.hydrator.deferSidebarHydration();
	assert.deepEqual(sidebarHarness.scheduler.pendingDelays(), [0]);
	sidebarHarness.scheduler.runNext();
	assert.equal(sidebarHarness.sidebarCalls(), 1);
	assert.equal(sidebarHarness.ensureCalls(), 1);
});

test("pauses background reads while editing and resumes afterwards", async () => {
	let paused = true;
	const harness = createHarness(150, { isPaused: () => paused });
	harness.hydrator.setInitialLoadSuccess(harness.plan, 50);
	const hydration = harness.hydrator.start(false);

	await harness.scheduler.runNextAndFlush();
	assert.equal(harness.pageRequests.length, 0);
	paused = false;
	await harness.scheduler.runNextAndFlush();
	assert.equal(await hydration, true);
	assert.deepEqual(harness.pageRequests, [{ offset: 50, limit: 100 }]);
});

test("cancels a scheduled count hydration before reading", async () => {
	const harness = createHarness(150);
	harness.hydrator.setInitialLoadSuccess(harness.plan, 50);
	const hydration = harness.hydrator.start(false);
	harness.hydrator.cancel();
	await harness.scheduler.runNextAndFlush();

	assert.equal(await hydration, false);
	assert.equal(harness.pageRequests.length, 0);
	assert.equal(harness.completedCalls(), 0);
});

test("reports a failed page without marking all memos loaded", async () => {
	const harness = createHarness(150, { failPage: true });
	harness.hydrator.setInitialLoadSuccess(harness.plan, 50);
	const hydration = harness.hydrator.start(true);
	await harness.scheduler.runNextAndFlush();

	assert.equal(await hydration, false);
	assert.equal(harness.failedCalls(), 1);
	assert.equal(harness.completedCalls(), 0);
	assert.equal(harness.hydrator.getSnapshot().allMemosLoaded, false);
});

function createHarness(total: number, overrides: { isPaused?: () => boolean; failPage?: boolean } = {}) {
	const scheduler = new TestScheduler();
	const plan = Array.from({ length: total }, (_, index) => `Memo/${String(index).padStart(4, "0")}.md`);
	const pageRequests: Array<{ offset: number; limit: number }> = [];
	const batchStates: MobileMemoHydrationRenderState[] = [];
	let memos: MemoRecord[] = [];
	let beginCalls = 0;
	let completedCalls = 0;
	let failedCalls = 0;
	let ensureCalls = 0;
	let sidebarCalls = 0;
	const hydrator = new MobileMemoHydrator({
		isMobile: () => true,
		isLoading: () => false,
		isPaused: overrides.isPaused,
		canHydrateCardFlow: () => true,
		scheduleTask: (callback, delayMs) => scheduler.schedule(callback, delayMs),
		cancelTask: (taskId) => scheduler.cancel(taskId),
		loadMemoPage: async (sourcePlan, offset, limit): Promise<MemoLoadPage> => {
			pageRequests.push({ offset, limit });
			if (overrides.failPage === true) throw new Error("page read failed");
			const nextOffset = Math.min(sourcePlan.length, offset + limit);
			return {
				memos: sourcePlan.slice(offset, nextOffset).map((path, index) => makeMemo(path, offset + index)),
				nextOffset,
				total: sourcePlan.length,
			};
		},
		getMemos: () => memos,
		setMemos: (nextMemos) => { memos = nextMemos; },
		invalidateFilteredMemos: () => {},
		captureRenderState: makeRenderState,
		onStarted: () => {},
		onBatchHydrated: (state) => batchStates.push(state),
		onCompleted: () => { completedCalls += 1; },
		onFailed: () => { failedCalls += 1; },
		onSidebarRequested: () => { sidebarCalls += 1; },
		beginScheduledHydration: () => { beginCalls += 1; },
		ensureAllMemosLoaded: () => { ensureCalls += 1; },
	});
	return {
		hydrator,
		plan,
		scheduler,
		pageRequests,
		batchStates,
		beginCalls: () => beginCalls,
		completedCalls: () => completedCalls,
		failedCalls: () => failedCalls,
		ensureCalls: () => ensureCalls,
		sidebarCalls: () => sidebarCalls,
	};
}

function makeRenderState(): MobileMemoHydrationRenderState {
	return { renderedCardCount: 4, previousCardFlowKey: "card-flow", previousMobileSearchKey: "mobile-search" };
}

class TestScheduler {
	private nextId = 1;
	private readonly tasks: Array<{ id: number; delayMs: number; callback: () => void }> = [];

	schedule(callback: () => void, delayMs: number): number {
		const id = this.nextId++;
		this.tasks.push({ id, delayMs, callback });
		return id;
	}

	cancel(taskId: number): void {
		const index = this.tasks.findIndex((task) => task.id === taskId);
		if (index !== -1) this.tasks.splice(index, 1);
	}

	pendingDelays(): number[] {
		return this.tasks.map((task) => task.delayMs);
	}

	runNext(): void {
		const task = this.tasks.shift();
		assert.notEqual(task, undefined);
		task?.callback();
	}

	async runNextAndFlush(): Promise<void> {
		this.runNext();
		for (let index = 0; index < 8; index += 1) await Promise.resolve();
	}
}

function makeMemo(id: string, order: number): MemoRecord {
	const createdAt = new Date(Date.UTC(2026, 0, 1, 0, order)).toISOString();
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
		tags: [], links: [], images: [], references: [], sourceMemoId: null, issue: null,
		lastMarkdownSyncAt: null, lastMarkdownSyncSource: null,
		dailyRef: { path: id, heading: null, lastKnownBlock: id, lastKnownHash: `hash-${id}`, lineNumberHint: 1, lastSyncedAt: null },
		monthlyRef: { path: "", dateHeading: "", lastKnownBlock: "", lastKnownHash: "", lineNumberHint: null, lastSyncedAt: null },
	};
}
