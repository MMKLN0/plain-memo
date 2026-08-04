import { normalizePath, TFile, TFolder } from "obsidian";
import type { App } from "obsidian";

import { ensureFolder, getParentFolderPath, getVaultAdapterPathType } from "../utils/vault";

export interface VaultJsonMutation<T> {
	nextData: unknown | null;
	result: T;
}

/** Serializes JSON file access inside the Vault. */
export class VaultJsonStore {
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(private readonly app: App) {}

	/** Creates a folder without creating any state files. */
	async ensureFolder(path: string): Promise<void> {
		await ensureFolder(this.app, path);
	}

	/** Reads a JSON file, returning null when it does not exist. */
	async read(path: string): Promise<unknown | null> {
		await this.writeQueue;
		return this.readNow(path);
	}

	/** Lists JSON files immediately below or below a Vault folder. */
	async list(folder: string): Promise<string[]> {
		await this.writeQueue;
		const normalizedFolder = normalizePath(folder);
		try {
			return (await collectAdapterJsonPaths(this.app, normalizedFolder)).sort();
		} catch {
			// Fall back to the indexed tree when an adapter cannot list this folder.
		}
		const root = this.app.vault.getAbstractFileByPath(normalizedFolder);
		if (!(root instanceof TFolder)) return [];
		return collectJsonPaths(root).sort();
	}

	/** Applies an exclusive read-modify-write operation to one JSON file. */
	async mutate<T>(
		path: string,
		mutation: (savedData: unknown | null) => VaultJsonMutation<T> | Promise<VaultJsonMutation<T>>,
	): Promise<T> {
		return this.runWriteExclusive(async () => {
			const { nextData, result } = await mutation(await this.readNow(path));
			if (nextData !== null) await this.writeNow(path, nextData);
			return result;
		});
	}

	/** Writes a complete JSON document. */
	async write(path: string, data: unknown): Promise<void> {
		await this.runWriteExclusive(() => this.writeNow(path, data));
	}

	/** Deletes a JSON file only when its latest stored value still matches a predicate. */
	async deleteIf(
		path: string,
		predicate: (savedData: unknown | null) => boolean | Promise<boolean>,
	): Promise<boolean> {
		return this.runWriteExclusive(async () => {
			if (!await predicate(await this.readNow(path))) return false;
			await this.deleteNow(path);
			return true;
		});
	}

	/** Reads and parses a JSON file while holding the store queue. */
	private async readNow(path: string): Promise<unknown | null> {
		const normalizedPath = normalizePath(path);
		const file = this.app.vault.getAbstractFileByPath(normalizedPath);
		let text: string;
		if (file instanceof TFile) {
			try {
				text = await this.app.vault.cachedRead(file);
			} catch {
				try {
					text = await this.app.vault.adapter.read(normalizedPath);
				} catch {
					return null;
				}
			}
		} else {
			try {
				text = await this.app.vault.adapter.read(normalizedPath);
			} catch {
				return null;
			}
		}
		if (text.trim().length === 0) return null;
		return JSON.parse(text) as unknown;
	}

	/** Creates or replaces one formatted JSON file. */
	private async writeNow(path: string, data: unknown): Promise<void> {
		const normalizedPath = normalizePath(path);
		const parent = getParentFolderPath(normalizedPath);
		if (parent !== null) await ensureFolder(this.app, parent);
		const text = `${JSON.stringify(data, null, 2)}\n`;
		const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, text);
			return;
		}
		if (existing !== null) throw new Error(`Path exists and is not a file: ${normalizedPath}`);
		const adapterType = await getVaultAdapterPathType(this.app, normalizedPath);
		if (adapterType === "file") {
			await this.app.vault.adapter.write(normalizedPath, text);
			return;
		}
		if (adapterType === "folder") throw new Error(`Path exists and is not a file: ${normalizedPath}`);
		try {
			await this.app.vault.create(normalizedPath, text);
		} catch (error) {
			if (await getVaultAdapterPathType(this.app, normalizedPath) === "file") {
				await this.app.vault.adapter.write(normalizedPath, text);
				return;
			}
			throw error;
		}
	}

	/** Permanently removes one internal JSON state file from the underlying adapter. */
	private async deleteNow(path: string): Promise<void> {
		const normalizedPath = normalizePath(path);
		const adapterType = await getVaultAdapterPathType(this.app, normalizedPath);
		if (adapterType === null) return;
		if (adapterType === "folder") throw new Error(`Path exists and is not a file: ${normalizedPath}`);
		try {
			await this.app.vault.adapter.remove(normalizedPath);
		} catch (error) {
			if (await getVaultAdapterPathType(this.app, normalizedPath) === null) return;
			throw error;
		}
	}

	/** Runs one write operation after all earlier writes finish. */
	private async runWriteExclusive<T>(operation: () => Promise<T>): Promise<T> {
		const previous = this.writeQueue;
		let releaseQueue: () => void = () => undefined;
		this.writeQueue = new Promise<void>((resolve) => { releaseQueue = resolve; });
		await previous;
		try {
			return await operation();
		} finally {
			releaseQueue();
		}
	}
}

/** Lists JSON files from the underlying adapter before the Vault index catches up. */
async function collectAdapterJsonPaths(app: App, folder: string): Promise<string[]> {
	const listed = await app.vault.adapter.list(folder);
	const paths = listed.files.filter((path) => path.toLowerCase().endsWith(".json"));
	for (const childFolder of listed.folders) paths.push(...await collectAdapterJsonPaths(app, childFolder));
	return paths;
}

/** Collects JSON files below one state directory without scanning the whole Vault. */
function collectJsonPaths(folder: TFolder): string[] {
	const paths: string[] = [];
	for (const child of folder.children) {
		if (child instanceof TFile && child.extension.toLowerCase() === "json") paths.push(child.path);
		if (child instanceof TFolder) paths.push(...collectJsonPaths(child));
	}
	return paths;
}
