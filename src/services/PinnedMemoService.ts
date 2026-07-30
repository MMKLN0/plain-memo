import { isRecord } from "../utils/object";
import { PluginDataStore } from "./PluginDataStore";

const PINNED_MEMOS_KEY = "pinnedMemos";

export interface PinnedMemoSnapshot {
	paths: string[];
	collapsed: boolean;
}

/** Persists the small amount of UI state associated with pinned standalone files. */
export class PinnedMemoService {
	private snapshot: PinnedMemoSnapshot = { paths: [], collapsed: false };

	constructor(private readonly store: PluginDataStore) {}

	async load(): Promise<void> { this.snapshot = parsePinnedMemoSnapshot(await this.store.read()); }
	getSnapshot(): PinnedMemoSnapshot { return { paths: [...this.snapshot.paths], collapsed: this.snapshot.collapsed }; }
	isPinned(path: string): boolean { return this.snapshot.paths.includes(path); }

	async pin(path: string, limit: number): Promise<boolean> {
		if (this.isPinned(path)) return true;
		if (this.snapshot.paths.length >= limit) return false;
		await this.save({ ...this.snapshot, paths: [path, ...this.snapshot.paths] });
		return true;
	}

	async unpin(path: string): Promise<void> {
		if (this.isPinned(path)) return;
		await this.save({ ...this.snapshot, paths: this.snapshot.paths.filter((item) => item !== path) });
	}

	async setCollapsed(collapsed: boolean): Promise<void> {
		if (this.snapshot.collapsed === collapsed) return;
		await this.save({ ...this.snapshot, collapsed });
	}

	async replacePath(oldPath: string, nextPath: string): Promise<void> {
		if (!this.isPinned(oldPath)) return;
		await this.save({ ...this.snapshot, paths: this.snapshot.paths.map((path) => path === oldPath ? nextPath : path) });
	}
	async removePath(path: string): Promise<void> { await this.unpin(path); }

	async retainExistingPaths(paths: readonly string[]): Promise<void> {
		const existing = new Set(paths);
		const nextPaths = this.snapshot.paths.filter((path) => existing.has(path));
		if (nextPaths.length !== this.snapshot.paths.length) {
			await this.save({ ...this.snapshot, paths: nextPaths });
		}
	}

	private async save(next: PinnedMemoSnapshot): Promise<void> {
		const normalized = normalizePinnedMemoSnapshot(next);
		await this.store.mutate((savedData) => {
			const data = isRecord(savedData) ? Object.assign({}, savedData) : { settings: savedData };
			data[PINNED_MEMOS_KEY] = normalized;
			return { nextData: data, result: undefined };
		});
		this.snapshot = normalized;
	}
}

function parsePinnedMemoSnapshot(savedData: unknown): PinnedMemoSnapshot {
	return isRecord(savedData) ? normalizePinnedMemoSnapshot(savedData[PINNED_MEMOS_KEY]) : { paths: [], collapsed: false };
}

function normalizePinnedMemoSnapshot(value: unknown): PinnedMemoSnapshot {
	if (!isRecord(value)) return { paths: [], collapsed: false };
	const paths = Array.isArray(value.paths) ? [...new Set(value.paths.filter((path): path is string => typeof path === "string" && path.length > 0))] : [];
	return { paths, collapsed: value.collapsed === true };
}
