import { t } from "../i18n";

export function formatMemoDisplayTime(value: string): string {
	const localTimestamp = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
	return localTimestamp === null ? value.replace("T", " ") : `${localTimestamp[1]} ${localTimestamp[2]}`;
}

export function formatOptionalMemoTime(value: string | undefined): string {
	return value === undefined || value.trim().length === 0 ? t("trash.unknownTime") : formatMemoDisplayTime(value);
}

export function formatDeleteSource(value: string): string {
	if (value === "knomo_ui") {
		return "Knomo";
	}
	if (value === "file_watch") {
		return t("deleteSource.fileWatch");
	}
	if (value === "manual_scan") {
		return t("deleteSource.manualScan");
	}
	if (value === "startup_scan") {
		return t("deleteSource.startupScan");
	}
	return value;
}
