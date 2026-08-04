import { normalizePath, TFile } from "obsidian";
import type { App } from "obsidian";

export interface ImageResourceCacheValue {
	file?: TFile;
	resourcePath?: string;
	url?: string;
	mtime?: number;
	missing: boolean;
}

interface ImageResourceCacheEntry {
	rawPath: string;
	value: ImageResourceCacheValue;
}

export class ImageResourceCache {
	private readonly entries = new Map<string, ImageResourceCacheEntry>();
	private readonly resourceRefreshVersions = new Map<string, number>();
	private refreshVersion = 0;

	get(sourcePath: string, rawPath: string, app: App): ImageResourceCacheValue {
		const key = getImageResourceCacheKey(sourcePath, rawPath);
		const cached = this.entries.get(key);
		if (cached !== undefined) {
			return cached.value;
		}
		const file = app.metadataCache.getFirstLinkpathDest(rawPath, sourcePath)
			?? resolveDirectVaultFile(rawPath, app);
		const value = file === null
			? { missing: true }
			: {
				file,
				resourcePath: file.path,
				url: appendResourceVersion(
					app.vault.getResourcePath(file),
					file.stat?.mtime,
					this.refreshVersion,
					this.resourceRefreshVersions.get(normalizeComparablePath(file.path)) ?? 0,
				),
				mtime: file.stat?.mtime,
				missing: false,
			};
		this.entries.set(key, { rawPath, value });
		return value;
	}

	invalidateImagePaths(paths: readonly string[]): void {
		const normalizedPaths = paths.map(normalizeComparablePath);
		for (const path of normalizedPaths) {
			this.resourceRefreshVersions.set(path, (this.resourceRefreshVersions.get(path) ?? 0) + 1);
		}
		const basenames = new Set(normalizedPaths.map(getPathBasename));
		for (const [key, entry] of this.entries) {
			const resolvedPath = entry.value.resourcePath;
			if (resolvedPath !== undefined && normalizedPaths.includes(normalizeComparablePath(resolvedPath))) {
				this.entries.delete(key);
				continue;
			}
			const rawPath = normalizeComparablePath(entry.rawPath);
			if (normalizedPaths.includes(rawPath) || basenames.has(getPathBasename(rawPath))) {
				this.entries.delete(key);
			}
		}
	}

	/** Drops cached misses after Obsidian finishes another metadata resolution pass. */
	invalidateMissing(): string[] {
		const rawPaths = new Set<string>();
		for (const [key, entry] of this.entries) {
			if (!entry.value.missing) continue;
			rawPaths.add(entry.rawPath);
			this.entries.delete(key);
		}
		return [...rawPaths];
	}

	clear(): void {
		this.entries.clear();
		this.resourceRefreshVersions.clear();
		this.refreshVersion += 1;
	}
}

/** Resolves complete Vault paths while the metadata cache is still catching up with sync. */
function resolveDirectVaultFile(rawPath: string, app: App): TFile | null {
	if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(rawPath)) return null;
	let decoded = rawPath;
	try {
		decoded = decodeURI(rawPath);
	} catch {
		// Preserve malformed percent escapes so the path simply remains unresolved.
	}
	const vault = app.vault as App["vault"] & { getAbstractFileByPath?: App["vault"]["getAbstractFileByPath"] };
	if (typeof vault.getAbstractFileByPath !== "function") return null;
	const direct = vault.getAbstractFileByPath(normalizePath(decoded.replace(/^\/+/, "")));
	return direct instanceof TFile ? direct : null;
}

function getImageResourceCacheKey(sourcePath: string, rawPath: string): string {
	return encodeParts([sourcePath, rawPath]);
}

function appendResourceVersion(
	url: string,
	modifiedAt: number | undefined,
	refreshVersion: number,
	resourceRefreshVersion: number,
): string {
	if (modifiedAt === undefined && refreshVersion === 0 && resourceRefreshVersion === 0) {
		return url;
	}
	const hashIndex = url.indexOf("#");
	const base = hashIndex === -1 ? url : url.slice(0, hashIndex);
	const fragment = hashIndex === -1 ? "" : url.slice(hashIndex);
	const params = [
		modifiedAt === undefined ? null : `knomo-mtime=${modifiedAt}`,
		refreshVersion === 0 && resourceRefreshVersion === 0
			? null
			: `knomo-refresh=${refreshVersion}-${resourceRefreshVersion}`,
	].filter((value): value is string => value !== null);
	const separator = base.includes("?") ? "&" : "?";
	return `${base}${separator}${params.join("&")}${fragment}`;
}

function encodeParts(parts: readonly string[]): string {
	return parts.map((part) => `${part.length}:${part}`).join("");
}

function normalizeComparablePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
}

function getPathBasename(path: string): string {
	const separatorIndex = path.lastIndexOf("/");
	return separatorIndex === -1 ? path : path.slice(separatorIndex + 1);
}
