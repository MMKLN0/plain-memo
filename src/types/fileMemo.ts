import type { MemoRecord } from "./memo";
import type { TimeBuoyInstance } from "./timeBuoy";

export interface CreateMemoResult {
	memo: MemoRecord;
	opId: string;
}

export interface CreateMemoOptions {
	source?: MemoRecord["source"];
	sourceMemoId?: string | null;
	sourceReferenceText?: string | null;
	dailyTrailer?: string | null;
}

export interface MemoStoreStatus {
	enabled: boolean;
	folder: string | null;
	format: string | null;
	message: string;
}

export interface DeletedMemoSummary {
	count: number;
	ids: string[];
}

export interface TimeBuoyQueryItem {
	instance: TimeBuoyInstance;
	memo: MemoRecord;
}

export interface TimeBuoyQueryResult {
	items: TimeBuoyQueryItem[];
	stale: TimeBuoyInstance[];
	missingPeriods: string[];
}

export interface TimeBuoyAllQueryResult extends TimeBuoyQueryResult {
	complete: boolean;
}

export interface TimeBuoyMaintenanceOutcome {
	status: "synced";
	dates: string[];
}
