import type { MemoRecord } from "../types/memo";
import { SHUFFLE_DAY_STATE_PATH } from "../constants";
import { normalizeSharedShuffleDayHistory } from "../utils/pluginData";
import {
	selectShuffleDay,
	type ShuffleDaySelectionResult,
} from "../utils/shuffleDay";
import type { VaultJsonStore } from "./VaultJsonStore";

export class ShuffleDayService {
	constructor(private readonly vaultDataStore: VaultJsonStore) {}

	async selectShuffleDay(memos: MemoRecord[]): Promise<ShuffleDaySelectionResult> {
		return this.vaultDataStore.mutate(SHUFFLE_DAY_STATE_PATH, (savedData) => {
			const result = selectShuffleDay(memos, {
				history: normalizeSharedShuffleDayHistory(savedData),
			});
			return {
				nextData: result.status === "ready"
					? result.nextHistory
					: null,
				result,
			};
		});
	}
}
