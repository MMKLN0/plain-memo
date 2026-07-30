import { t } from "../i18n";
import type { MemoIssue } from "../types/issue";

export function formatServiceError(error: unknown, fallbackMessage = t("service.unknownError")): string {
	if (error instanceof Error && error.message.length > 0) return formatSettingsText(error.message);
	if (typeof error === "string" && error.length > 0) return formatSettingsText(error);
	return fallbackMessage;
}

export function formatMemoIssue(issue: MemoIssue): string {
	return formatSettingsText(issue.message);
}

export function formatSettingsText(text: string): string {
	return text
		.replace(/\bmemoId\b/g, t("term.memoId"))
		.replace(/\bmemo\b|\bMemo\b|\bMEMO\b/g, t("term.memo"))
		.replace(/\bblockId\b/g, t("term.blockId"))
		.replace(/\bblock\b/gi, t("term.block"));
}
