import { normalizePath } from "obsidian";

export function normalizeVaultPath(path: string): string {
	const trimmedPath = path.trim();
	if (!trimmedPath) return "";
	const normalizedPath = normalizePath(trimmedPath);
	return normalizedPath.replace(/^\/+/, "");
}
