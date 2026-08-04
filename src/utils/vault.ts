import { normalizePath, TFile, TFolder } from "obsidian";
import type { App } from "obsidian";

export async function ensureFolder(app: App, folderPath: string): Promise<void> {
	const normalizedPath = normalizePath(folderPath);
	if (normalizedPath === "" || normalizedPath === "/") {
		return;
	}

	const segments = normalizedPath.split("/");
	let currentPath = "";
	for (const segment of segments) {
		currentPath = currentPath.length === 0 ? segment : `${currentPath}/${segment}`;
		const existing = app.vault.getAbstractFileByPath(currentPath);
		if (existing instanceof TFolder) {
			continue;
		}
		if (existing !== null) {
			throw new Error(`Path exists and is not a folder: ${currentPath}`);
		}
		const adapterType = await getVaultAdapterPathType(app, currentPath);
		if (adapterType === "folder") {
			continue;
		}
		if (adapterType === "file") {
			throw new Error(`Path exists and is not a folder: ${currentPath}`);
		}
		try {
			await app.vault.createFolder(currentPath);
		} catch (error) {
			const nextExisting = app.vault.getAbstractFileByPath(currentPath);
			if (nextExisting instanceof TFolder || await getVaultAdapterPathType(app, currentPath) === "folder") {
				continue;
			}
			throw error;
		}
	}
}

/** Reads the underlying filesystem when the mobile Vault index is not ready yet. */
export async function getVaultAdapterPathType(app: App, path: string): Promise<"file" | "folder" | null> {
	try {
		return (await app.vault.adapter.stat(path))?.type ?? null;
	} catch {
		return null;
	}
}

export async function ensureTextFile(app: App, filePath: string): Promise<TFile> {
	const normalizedPath = normalizePath(filePath);
	const existing = app.vault.getAbstractFileByPath(normalizedPath);
	if (existing instanceof TFile) {
		return existing;
	}
	if (existing !== null) {
		throw new Error(`Path exists and is not a file: ${normalizedPath}`);
	}

	const parentFolder = getParentFolderPath(normalizedPath);
	if (parentFolder !== null) {
		await ensureFolder(app, parentFolder);
	}

	try {
		return await app.vault.create(normalizedPath, "");
	} catch (error) {
		const nextExisting = app.vault.getAbstractFileByPath(normalizedPath);
		if (nextExisting instanceof TFile) {
			return nextExisting;
		}
		throw error;
	}
}

export function getParentFolderPath(filePath: string): string | null {
	const normalizedPath = normalizePath(filePath);
	const separatorIndex = normalizedPath.lastIndexOf("/");
	if (separatorIndex === -1) {
		return null;
	}
	return normalizedPath.slice(0, separatorIndex);
}
