import type { MemoRecord } from "../types/memo";
import type { MemoReviewStateMap } from "../types/review";
import { RANDOM_REUNION_STATE_PATH } from "../constants";
import { normalizeRandomReunionReviewStates } from "../utils/pluginData";
import {
	getRandomReunionMemos,
	markMemoReviewed,
} from "../utils/randomReunion";
import type { VaultJsonStore } from "./VaultJsonStore";

export class RandomReunionService {
	constructor(private readonly vaultDataStore: VaultJsonStore) {}

	async getRandomReunionMemos(count: number, memos: MemoRecord[]): Promise<MemoRecord[]> {
		const reviewStates = await this.loadReviewStates();
		return getRandomReunionMemos(memos, reviewStates, count);
	}

	async markRandomReunionReviewed(memoId: string): Promise<void> {
		await this.vaultDataStore.mutate(RANDOM_REUNION_STATE_PATH, (savedData) => {
			const reviewStates = normalizeRandomReunionReviewStates(savedData);
			return {
				nextData: markMemoReviewed(reviewStates, memoId),
				result: undefined,
			};
		});
	}

	async loadReviewStates(): Promise<MemoReviewStateMap> {
		return normalizeRandomReunionReviewStates(await this.vaultDataStore.read(RANDOM_REUNION_STATE_PATH));
	}
}
