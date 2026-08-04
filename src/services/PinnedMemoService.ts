import { PINNED_MEMOS_FOLDER } from "../constants";
import { hashText } from "../utils/hash";
import {
	buildPluginDataWithPinnedSectionCollapsed,
	extractPinnedSectionCollapsed,
} from "../utils/localPluginData";
import { isRecord } from "../utils/object";
import type { PluginDataStore } from "./PluginDataStore";
import type { VaultJsonStore } from "./VaultJsonStore";

interface PinnedMemoRecord {
	path: string;
	pinnedAt: string;
	updatedAt: string;
	pinned: boolean;
}

export interface PinnedMemoSnapshot {
	paths: string[];
	collapsed: boolean;
}

/** Persists shared pin markers while keeping expansion state device-local. */
export class PinnedMemoService {
	private snapshot: PinnedMemoSnapshot = { paths: [], collapsed: false };

	constructor(
		private readonly vaultStore: VaultJsonStore,
		private readonly localStore: PluginDataStore,
	) {}

	/** Loads shared pin markers and local expansion state. */
	async load(): Promise<void> {
		this.snapshot = await this.readSnapshot();
	}

	/** Reloads pin markers and reports whether visible shared state changed. */
	async reloadIfChanged(): Promise<boolean> {
		const next = await this.readSnapshot();
		if (arePinnedMemoSnapshotsEqual(this.snapshot, next)) return false;
		this.snapshot = next;
		return true;
	}

	/** Returns a defensive copy of current pin state. */
	getSnapshot(): PinnedMemoSnapshot {
		return { paths: [...this.snapshot.paths], collapsed: this.snapshot.collapsed };
	}

	/** Tests whether a memo path is currently pinned. */
	isPinned(path: string): boolean { return this.snapshot.paths.includes(path); }

	/** Creates one shared marker for a memo unless the configured limit is reached. */
	async pin(path: string, limit: number): Promise<boolean> {
		if (this.isPinned(path)) return true;
		if (this.snapshot.paths.length >= limit) return false;
		const markerPath = await this.allocateMarkerPath(path);
		const timestamp = new Date().toISOString();
		const record: PinnedMemoRecord = { path, pinnedAt: timestamp, updatedAt: timestamp, pinned: true };
		await this.vaultStore.write(markerPath, record);
		this.snapshot = await this.readSnapshot();
		return true;
	}

	/** Writes an unpinned tombstone for every marker of one memo path. */
	async unpin(path: string): Promise<void> {
		for (const markerPath of await this.vaultStore.list(PINNED_MEMOS_FOLDER)) {
			const record = parsePinnedMemoRecord(await this.vaultStore.read(markerPath));
			if (record?.path === path && record.pinned) {
				await this.vaultStore.write(markerPath, { ...record, updatedAt: new Date().toISOString(), pinned: false });
			}
		}
		this.snapshot = await this.readSnapshot();
	}

	/** Saves the local-only expansion state without touching shared pins. */
	async setCollapsed(collapsed: boolean): Promise<void> {
		if (this.snapshot.collapsed === collapsed) return;
		await this.localStore.mutate((savedData) => ({
			nextData: buildPluginDataWithPinnedSectionCollapsed(savedData, collapsed),
			result: undefined,
		}));
		this.snapshot = { ...this.snapshot, collapsed };
	}

	/** Updates the path recorded by a marker after a Vault rename. */
	async replacePath(oldPath: string, nextPath: string): Promise<void> {
		for (const markerPath of await this.vaultStore.list(PINNED_MEMOS_FOLDER)) {
			const record = parsePinnedMemoRecord(await this.vaultStore.read(markerPath));
			if (record?.path === oldPath) {
				await this.vaultStore.write(markerPath, { ...record, path: nextPath, updatedAt: new Date().toISOString() });
			}
		}
		this.snapshot = await this.readSnapshot();
	}

	/** Removes a marker when its memo is deleted or moved outside the scan scope. */
	async removePath(path: string): Promise<void> { await this.unpin(path); }

	/** Checks whether a Vault path belongs to the shared pin state directory. */
	isStatePath(path: string): boolean {
		return path === PINNED_MEMOS_FOLDER || path.startsWith(`${PINNED_MEMOS_FOLDER}/`);
	}

	/** Reads all valid markers and the local expansion flag. */
	private async readSnapshot(): Promise<PinnedMemoSnapshot> {
		const records: PinnedMemoRecord[] = [];
		for (const markerPath of await this.vaultStore.list(PINNED_MEMOS_FOLDER)) {
			const record = parsePinnedMemoRecord(await this.vaultStore.read(markerPath));
			if (record !== null) records.push(record);
		}
		const latestByPath = new Map(records
			.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.path.localeCompare(right.path))
			.map((record) => [record.path, record]));
		const paths = [...latestByPath.values()]
			.filter((record) => record.pinned)
			.sort((left, right) => right.pinnedAt.localeCompare(left.pinnedAt) || left.path.localeCompare(right.path))
			.map((record) => record.path);
		const localData = await this.localStore.read();
		return { paths, collapsed: extractPinnedSectionCollapsed(localData) };
	}

	/** Allocates a stable marker path while handling rare hash collisions. */
	private async allocateMarkerPath(path: string): Promise<string> {
		const stem = `${PINNED_MEMOS_FOLDER}/${hashText(path).replace("fnv1a-", "")}`;
		for (let suffix = 1; ; suffix += 1) {
			const candidate = `${stem}${suffix === 1 ? "" : `-${suffix}`}.json`;
			const existing = parsePinnedMemoRecord(await this.vaultStore.read(candidate));
			if (existing === null || existing.path === path) return candidate;
		}
	}
}

/** Parses and validates one marker file. */
function parsePinnedMemoRecord(value: unknown | null): PinnedMemoRecord | null {
	if (!isRecord(value) || typeof value.path !== "string" || value.path.length === 0 || typeof value.pinnedAt !== "string") return null;
	return {
		path: value.path,
		pinnedAt: value.pinnedAt,
		updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : value.pinnedAt,
		pinned: value.pinned !== false,
	};
}

/** Compares only shared paths and the local expansion flag. */
function arePinnedMemoSnapshotsEqual(left: PinnedMemoSnapshot, right: PinnedMemoSnapshot): boolean {
	return left.collapsed === right.collapsed
		&& left.paths.length === right.paths.length
		&& left.paths.every((path, index) => path === right.paths[index]);
}
