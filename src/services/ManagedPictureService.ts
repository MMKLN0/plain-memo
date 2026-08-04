import { normalizePath, TFile } from "obsidian";
import type { App } from "obsidian";

import { PLAIN_MEMO_PICTURE_FOLDER } from "../constants";
import { parseMemoImages, parseMemoLinks } from "../utils/markdown";
import { ensureFolder, getVaultAdapterPathType } from "../utils/vault";

/** Owns image files created by PlainMemo and removes only unreferenced managed pictures. */
export class ManagedPictureService {
	constructor(private readonly app: App) {}

	/** Creates a uniquely named managed picture, optionally reusing identical existing data. */
	async createBinary(fileName: string, data: Uint8Array, reuseIdentical = false): Promise<TFile> {
		await ensureFolder(this.app, PLAIN_MEMO_PICTURE_FOLDER);
		const safeName = toSafePictureFileName(fileName);
		const extensionIndex = safeName.lastIndexOf(".");
		const stem = extensionIndex <= 0 ? safeName : safeName.slice(0, extensionIndex);
		const extension = extensionIndex <= 0 ? "" : safeName.slice(extensionIndex);
		for (let suffix = 1; ; suffix += 1) {
			const name = suffix === 1 ? safeName : `${stem} (${suffix})${extension}`;
			const path = normalizePath(`${PLAIN_MEMO_PICTURE_FOLDER}/${name}`);
			const existing = this.app.vault.getAbstractFileByPath(path);
			if (existing instanceof TFile) {
				if (reuseIdentical && await this.hasSameData(existing, data)) return existing;
				continue;
			}
			if (existing !== null || await getVaultAdapterPathType(this.app, path) !== null) continue;
			try {
				return await this.app.vault.createBinary(path, copyBytes(data));
			} catch (error) {
				if (await getVaultAdapterPathType(this.app, path) !== null) continue;
				throw error;
			}
		}
	}

	/** Resolves managed pictures referenced by one Markdown document. */
	findReferencedPictures(content: string, sourcePath: string): string[] {
		return [...this.collectReferencedPicturePaths(content, sourcePath)].sort();
	}

	/** Moves managed pictures to Obsidian Trash when no remaining Markdown file references them. */
	async trashUnreferenced(
		candidatePaths: readonly string[],
		excludedMarkdownPaths: readonly string[] = [],
	): Promise<string[]> {
		const pending = new Set(candidatePaths
			.map((path) => normalizePath(path))
			.filter((path) => isManagedPicturePath(path)));
		if (pending.size === 0) return [];
		const excluded = new Set(excludedMarkdownPaths.map((path) => normalizePath(path)));
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (excluded.has(file.path)) continue;
			const content = await this.app.vault.cachedRead(file);
			for (const referencedPath of this.collectReferencedPicturePaths(content, file.path)) {
				pending.delete(referencedPath);
			}
			if (pending.size === 0) return [];
		}
		const trashed: string[] = [];
		for (const path of pending) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) continue;
			await this.app.fileManager.trashFile(file);
			trashed.push(path);
		}
		return trashed;
	}

	/** Compares one existing picture with candidate bytes without failing allocation on read errors. */
	private async hasSameData(file: TFile, data: Uint8Array): Promise<boolean> {
		try {
			return bytesEqual(new Uint8Array(await this.app.vault.readBinary(file)), data);
		} catch {
			return false;
		}
	}

	/** Collects managed picture paths from image embeds and ordinary local links. */
	private collectReferencedPicturePaths(content: string, sourcePath: string): Set<string> {
		const rawPaths = [
			...parseMemoImages(content).map((image) => image.path),
			...parseMemoLinks(content)
				.filter((link) => link.syntax !== "url")
				.map((link) => link.target),
		];
		const paths = new Set<string>();
		for (const rawPath of rawPaths) {
			const resolved = this.resolvePicturePath(rawPath, sourcePath);
			if (resolved !== null && isManagedPicturePath(resolved)) paths.add(resolved);
		}
		return paths;
	}

	/** Resolves an Obsidian link target, with a full Vault-path fallback during cache lag. */
	private resolvePicturePath(rawPath: string, sourcePath: string): string | null {
		if (hasUrlScheme(rawPath)) return null;
		const target = this.app.metadataCache.getFirstLinkpathDest(rawPath, sourcePath);
		if (target instanceof TFile) return normalizePath(target.path);
		const directPath = normalizeLocalLinkPath(rawPath);
		const direct = this.app.vault.getAbstractFileByPath(directPath);
		return direct instanceof TFile ? normalizePath(direct.path) : null;
	}
}

/** Sanitizes an imported or browser-provided filename for every supported Vault filesystem. */
function toSafePictureFileName(fileName: string): string {
	const basename = fileName.replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
	const safe = basename
		.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
		.replace(/[. ]+$/g, "")
		.trim();
	return safe || "image";
}

/** Converts a local link target into a normalized Vault-relative path. */
function normalizeLocalLinkPath(path: string): string {
	let decoded = path;
	try {
		decoded = decodeURI(path);
	} catch {
		// Preserve malformed percent escapes so they simply fail to resolve.
	}
	return normalizePath(decoded.replace(/^\/+/, ""));
}

/** Tests whether a path belongs to PlainMemo's managed picture directory. */
function isManagedPicturePath(path: string): boolean {
	return path.startsWith(`${PLAIN_MEMO_PICTURE_FOLDER}/`);
}

/** Tests for remote and other URI schemes that must never be managed as Vault files. */
function hasUrlScheme(path: string): boolean {
	return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(path);
}

/** Produces an exact standalone ArrayBuffer for Obsidian binary writes. */
function copyBytes(data: Uint8Array): ArrayBuffer {
	const copy = new Uint8Array(data.byteLength);
	copy.set(data);
	return copy.buffer;
}

/** Compares binary attachment content for import deduplication. */
function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
	if (left.byteLength !== right.byteLength) return false;
	for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false;
	return true;
}
