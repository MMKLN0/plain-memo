import type { MemoLoadPage } from "../services/FileMemoOrchestrator";
import type { MemoRecord } from "../types/memo";

const MOBILE_MEMO_HYDRATE_INITIAL_DELAY_MS = 1200;
const MOBILE_MEMO_HYDRATE_BACKGROUND_DELAY_MS = 180;
const MOBILE_MEMO_HYDRATE_BATCH_SIZE = 100;

export type MemoLoadMode = "recent" | "hydrating" | "all";

export interface MobileMemoHydrationRenderState {
	renderedCardCount: number;
	previousCardFlowKey: string;
	previousMobileSearchKey: string;
}

export interface MobileMemoHydratorSnapshot {
	allMemosLoaded: boolean;
	loadMode: MemoLoadMode;
	runId: number;
	fastMode: boolean;
	renderNextBatchAfterHydration: boolean;
	loadedMemoCount: number;
	totalMemoCount: number;
}

interface MobileMemoHydratorOptions {
	shouldHydrateIncrementally: () => boolean;
	isLoading: () => boolean;
	isPaused?: () => boolean;
	canHydrateCardFlow: () => boolean;
	scheduleTask: (callback: () => void, delayMs: number) => number;
	cancelTask: (taskId: number) => void;
	loadMemoPage: (plan: readonly string[], offset: number, limit: number) => Promise<MemoLoadPage>;
	getMemos: () => MemoRecord[];
	setMemos: (memos: MemoRecord[]) => void;
	invalidateFilteredMemos: () => void;
	captureRenderState: () => MobileMemoHydrationRenderState;
	onStarted: () => void;
	onBatchHydrated: (state: MobileMemoHydrationRenderState) => void;
	onCompleted: (state: MobileMemoHydrationRenderState) => void;
	onFailed: () => void;
	onSidebarRequested: () => void;
	beginScheduledHydration: () => void;
	ensureAllMemosLoaded: () => void;
}

/** Incrementally hydrates a stable filename-sorted plan without tying batch size to calendar periods. */
export class MobileMemoHydrator {
	private allMemosLoaded = false;
	private loadMode: MemoLoadMode = "recent";
	private loadPlan: string[] = [];
	private loadedMemoCount = 0;
	private hydrateTimerId: number | null = null;
	private sidebarHydrateTimerId: number | null = null;
	private runId = 0;
	private fastMode = false;
	private renderNextBatchAfterHydration = false;

	constructor(private readonly options: MobileMemoHydratorOptions) {}

	getSnapshot(): MobileMemoHydratorSnapshot {
		return {
			allMemosLoaded: this.allMemosLoaded,
			loadMode: this.loadMode,
			runId: this.runId,
			fastMode: this.fastMode,
			renderNextBatchAfterHydration: this.renderNextBatchAfterHydration,
			loadedMemoCount: this.loadedMemoCount,
			totalMemoCount: this.loadPlan.length,
		};
	}

	isCurrentRun(runId: number): boolean {
		return runId === this.runId;
	}

	setReloadSuccess(loadAll: boolean, plan: readonly string[], loadedMemoCount: number): void {
		this.setLoadProgress(plan, loadAll ? plan.length : loadedMemoCount);
		this.allMemosLoaded = loadAll || this.loadedMemoCount >= this.loadPlan.length;
		this.loadMode = this.allMemosLoaded ? "all" : "recent";
	}

	setInitialLoadSuccess(plan: readonly string[], loadedMemoCount: number): void {
		this.setLoadProgress(plan, loadedMemoCount);
		this.allMemosLoaded = this.loadedMemoCount >= this.loadPlan.length;
		this.loadMode = this.allMemosLoaded ? "all" : "recent";
	}

	setInitialLoadProgress(loadedMemoCount: number): void {
		this.loadedMemoCount = Math.max(this.loadedMemoCount, clampCount(loadedMemoCount, this.loadPlan.length));
		this.allMemosLoaded = this.loadedMemoCount >= this.loadPlan.length;
		this.loadMode = this.allMemosLoaded ? "all" : "recent";
	}

	setLoadFailure(): void {
		this.loadMode = "recent";
	}

	schedule(): void {
		if (!this.options.shouldHydrateIncrementally() || this.allMemosLoaded || this.options.isLoading() || this.hydrateTimerId !== null) {
			return;
		}
		this.hydrateTimerId = this.options.scheduleTask(() => {
			this.hydrateTimerId = null;
			if (!this.options.isLoading()) this.options.beginScheduledHydration();
		}, MOBILE_MEMO_HYDRATE_INITIAL_DELAY_MS);
	}

	start(fastMode: boolean): Promise<boolean> {
		if (!this.options.shouldHydrateIncrementally() || this.allMemosLoaded) return Promise.resolve(this.allMemosLoaded);
		if (fastMode) this.fastMode = true;
		this.clearScheduled();
		this.loadMode = "hydrating";
		this.options.onStarted();
		const runId = this.runId + 1;
		this.runId = runId;
		return this.hydrate(runId);
	}

	accelerate(): void {
		if (this.options.shouldHydrateIncrementally() && !this.allMemosLoaded) {
			this.fastMode = true;
			this.clearScheduled();
		}
	}

	requestSidebarHydration(): void {
		if (!this.options.shouldHydrateIncrementally() || this.allMemosLoaded) return;
		this.fastMode = true;
		this.loadMode = "hydrating";
		this.options.ensureAllMemosLoaded();
		this.options.onSidebarRequested();
	}

	deferSidebarHydration(): void {
		if (!this.options.shouldHydrateIncrementally() || this.allMemosLoaded || this.sidebarHydrateTimerId !== null) return;
		this.sidebarHydrateTimerId = this.options.scheduleTask(() => {
			this.sidebarHydrateTimerId = null;
			this.requestSidebarHydration();
		}, 0);
	}

	requestCardFlowHydration(): void {
		if (!this.options.shouldHydrateIncrementally() || this.allMemosLoaded || !this.options.canHydrateCardFlow()) return;
		this.fastMode = true;
		this.loadMode = "hydrating";
		this.renderNextBatchAfterHydration = true;
		this.options.ensureAllMemosLoaded();
	}

	consumeRenderNextBatchRequest(): void {
		this.renderNextBatchAfterHydration = false;
	}

	clearScheduled(): void {
		if (this.hydrateTimerId === null) return;
		this.options.cancelTask(this.hydrateTimerId);
		this.hydrateTimerId = null;
	}

	cancel(): void {
		this.runId += 1;
		this.fastMode = false;
		this.renderNextBatchAfterHydration = false;
		this.clearScheduled();
		this.clearDeferredSidebarHydration();
	}

	private async hydrate(runId: number): Promise<boolean> {
		try {
			while (this.loadedMemoCount < this.loadPlan.length) {
				if (!await this.waitForHydrationTurn(runId)) return false;
				const offset = this.loadedMemoCount;
				const page = await this.options.loadMemoPage(this.loadPlan, offset, MOBILE_MEMO_HYDRATE_BATCH_SIZE);
				if (!this.isCurrentRun(runId)) return false;
				if (page.nextOffset <= offset) throw new Error("Mobile memo hydration did not advance.");
				const hasMore = page.nextOffset < this.loadPlan.length;
				if (!await this.commitHydratedMemos(runId, page.memos, page.nextOffset, hasMore)) return false;
			}
			if (!this.isCurrentRun(runId)) return false;
			this.completeMobileMemoHydration();
			return true;
		} catch {
			if (this.isCurrentRun(runId)) {
				this.fastMode = false;
				this.loadMode = this.allMemosLoaded ? "all" : "recent";
				this.options.onFailed();
			}
			return false;
		}
	}

	private async waitForHydrationTurn(runId: number): Promise<boolean> {
		while (true) {
			const delay = this.isPaused() || !this.fastMode ? MOBILE_MEMO_HYDRATE_BACKGROUND_DELAY_MS : 0;
			const shouldContinue = await this.waitForTurn(runId, delay);
			if (!shouldContinue || !this.isPaused()) return shouldContinue;
		}
	}

	private waitForTurn(runId: number, delay: number): Promise<boolean> {
		return new Promise((resolve) => {
			this.options.scheduleTask(() => resolve(this.isCurrentRun(runId)), delay);
		});
	}

	private async commitHydratedMemos(
		runId: number,
		memos: readonly MemoRecord[],
		nextOffset: number,
		notifyUi: boolean,
	): Promise<boolean> {
		if (this.isPaused() && !await this.waitForHydrationTurn(runId)) return false;
		if (!this.isCurrentRun(runId)) return false;
		const renderState = notifyUi ? this.options.captureRenderState() : null;
		this.mergeHydratedMemos(memos, notifyUi);
		this.loadedMemoCount = clampCount(nextOffset, this.loadPlan.length);
		if (renderState !== null) this.options.onBatchHydrated(renderState);
		return true;
	}

	private mergeHydratedMemos(memos: readonly MemoRecord[], invalidateFilteredMemos: boolean): void {
		if (memos.length === 0) return;
		const memoById = new Map(this.options.getMemos().map((memo) => [memo.id, memo]));
		for (const memo of memos) memoById.set(memo.id, memo);
		this.options.setMemos(Array.from(memoById.values())
			.filter((memo) => memo.status === "active")
			.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || compareText(left.id, right.id)));
		if (invalidateFilteredMemos) this.options.invalidateFilteredMemos();
	}

	private completeMobileMemoHydration(): void {
		const renderState = this.options.captureRenderState();
		this.allMemosLoaded = true;
		this.loadedMemoCount = this.loadPlan.length;
		this.loadMode = "all";
		this.fastMode = false;
		this.options.invalidateFilteredMemos();
		this.options.onCompleted(renderState);
		this.renderNextBatchAfterHydration = false;
	}

	private setLoadProgress(plan: readonly string[], loadedMemoCount: number): void {
		this.loadPlan = [...plan];
		this.loadedMemoCount = clampCount(loadedMemoCount, this.loadPlan.length);
	}

	private isPaused(): boolean {
		return this.options.isPaused?.() ?? false;
	}

	private clearDeferredSidebarHydration(): void {
		if (this.sidebarHydrateTimerId === null) return;
		this.options.cancelTask(this.sidebarHydrateTimerId);
		this.sidebarHydrateTimerId = null;
	}
}

function clampCount(value: number, total: number): number {
	return Math.max(0, Math.min(total, Math.floor(value)));
}

function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}
