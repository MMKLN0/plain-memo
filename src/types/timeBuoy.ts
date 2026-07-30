export type TimeBuoyDateStatus = "today" | "upcoming" | "past";

export interface TimeBuoyInstance {
	memoId: string;
	targetDate: string;
	sourcePeriod: string;
	buoyRevision: string;
}

export interface TimeBuoyMatch {
	targetDate: string;
	start: number;
	end: number;
}
