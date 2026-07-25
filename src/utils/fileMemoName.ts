export const MEMO_FILE_SUFFIX = /_(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?: \(\d+\))?\.md$/i;
export const MAX_MEMO_FILE_STEM_LENGTH = 100;

export function isPlainMemoFileName(name: string): boolean {
	return MEMO_FILE_SUFFIX.test(name);
}

export function formatMemoFilenameTimestamp(date: Date): string {
	return `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Keep the displayed Markdown untouched; this only makes a Windows-safe filename stem. */
export function toSafeMemoFileStem(value: string, fallback = "Memo"): string {
	return value
		.replace(/[\\/:*?\"<>|]/g, "-")
		.replace(/[\u0000-\u001f]/g, "")
		.replace(/\s+/g, " ")
		.replace(/[. ]+$/g, "")
		.slice(0, MAX_MEMO_FILE_STEM_LENGTH)
		.trim() || fallback;
}

export function parseMemoFilenameTimestamp(name: string): Date | null {
	const match = name.match(MEMO_FILE_SUFFIX);
	if (match === null) return null;
	const parts = match.slice(1, 6).map(Number);
	const date = new Date(2000 + parts[0], parts[1] - 1, parts[2], parts[3], parts[4]);
	return date.getFullYear() === 2000 + parts[0]
		&& date.getMonth() === parts[1] - 1
		&& date.getDate() === parts[2]
		&& date.getHours() === parts[3]
		&& date.getMinutes() === parts[4]
		? date
		: null;
}
