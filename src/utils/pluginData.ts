import type { MemoReviewState, MemoReviewStateMap } from "../types/review";
import type { ShuffleDayHistoryEntry } from "./shuffleDay";
import { isRecord } from "./object";
import { normalizeShuffleDayHistory } from "./shuffleDay";

const MAINTENANCE_DIAGNOSTIC_KEY = "maintenanceDiagnostic";

export type MaintenanceDiagnosticTask = "startup_scan" | "file_watch" | "repair";
export type MaintenanceDiagnosticStatus = "completed" | "failed";

export interface MaintenanceDiagnostic {
	task: MaintenanceDiagnosticTask;
	status: MaintenanceDiagnosticStatus;
	occurredAt: string;
	scope: string | null;
	mode: string | null;
	message: string;
	scannedFiles: number | null;
	created: number | null;
	updated: number | null;
	deleted: number | null;
	failed: number | null;
}

export function extractMaintenanceDiagnostic(savedData: unknown): MaintenanceDiagnostic | null {
	if (!isRecord(savedData)) {
		return null;
	}
	return normalizeMaintenanceDiagnostic(savedData[MAINTENANCE_DIAGNOSTIC_KEY]);
}

export function buildPluginDataWithMaintenanceDiagnostic(
	savedData: unknown,
	diagnostic: MaintenanceDiagnostic,
): Record<string, unknown> {
	const nextData = Object.assign({}, isRecord(savedData) ? savedData : {});
	nextData[MAINTENANCE_DIAGNOSTIC_KEY] = diagnostic;
	return nextData;
}

/** Normalizes the standalone shared random-reunion state file. */
export function normalizeRandomReunionReviewStates(value: unknown): MemoReviewStateMap {
	if (!isRecord(value)) return {};
	const states: MemoReviewStateMap = {};
	for (const [memoId, stateValue] of Object.entries(value)) {
		const state = normalizeReviewState(memoId, stateValue);
		if (state !== null) {
			states[memoId] = state;
		}
	}
	return states;
}

/** Normalizes the standalone shared shuffle-day history file. */
export function normalizeSharedShuffleDayHistory(value: unknown): ShuffleDayHistoryEntry[] {
	if (!Array.isArray(value)) return [];
	return normalizeShuffleDayHistory(value.map(normalizeShuffleDayHistoryEntry)
		.filter((entry): entry is ShuffleDayHistoryEntry => entry !== null));
}

function normalizeMaintenanceDiagnostic(value: unknown): MaintenanceDiagnostic | null {
	if (!isRecord(value)) {
		return null;
	}
	const task = normalizeDiagnosticTask(value.task);
	const status = normalizeDiagnosticStatus(value.status);
	const occurredAt = typeof value.occurredAt === "string" ? value.occurredAt : "";
	const message = typeof value.message === "string" ? value.message : "";
	if (task === null || status === null || occurredAt.length === 0 || message.length === 0) {
		return null;
	}
	return {
		task,
		status,
		occurredAt,
		scope: normalizeNullableString(value.scope),
		mode: normalizeNullableString(value.mode),
		message,
		scannedFiles: normalizeNullableNumber(value.scannedFiles),
		created: normalizeNullableNumber(value.created),
		updated: normalizeNullableNumber(value.updated),
		deleted: normalizeNullableNumber(value.deleted),
		failed: normalizeNullableNumber(value.failed),
	};
}

function normalizeDiagnosticTask(value: unknown): MaintenanceDiagnosticTask | null {
	return value === "startup_scan" || value === "file_watch" || value === "repair" ? value : null;
}

function normalizeDiagnosticStatus(value: unknown): MaintenanceDiagnosticStatus | null {
	return value === "completed" || value === "failed" ? value : null;
}

function normalizeNullableString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeNullableNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeReviewState(memoId: string, value: unknown): MemoReviewState | null {
	if (!isRecord(value)) {
		return null;
	}
	const stateMemoId = typeof value.memoId === "string" && value.memoId.length > 0 ? value.memoId : memoId;
	const reviewCount = typeof value.reviewCount === "number" && Number.isFinite(value.reviewCount)
		? Math.max(0, Math.floor(value.reviewCount))
		: 0;
	const lastReviewedAt = typeof value.lastReviewedAt === "string" && value.lastReviewedAt.length > 0
		? value.lastReviewedAt
		: undefined;
	return lastReviewedAt === undefined
		? { memoId: stateMemoId, reviewCount }
		: { memoId: stateMemoId, lastReviewedAt, reviewCount };
}

function normalizeShuffleDayHistoryEntry(value: unknown): ShuffleDayHistoryEntry | null {
	if (!isRecord(value) || typeof value.date !== "string" || typeof value.shownAt !== "string") {
		return null;
	}
	return {
		date: value.date,
		shownAt: value.shownAt,
	};
}
