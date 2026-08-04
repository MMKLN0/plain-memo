import { TFile, normalizePath } from "obsidian";
import type { App } from "obsidian";

import { RecordStatsBuilder, type PreparedRecordStats } from "./RecordStatsService";
import { MarkdownBlockService } from "./MarkdownBlockService";
import { ManagedPictureService } from "./ManagedPictureService";
import type {
	CreateMemoOptions,
	CreateMemoResult,
	DeletedMemoSummary,
	MemoStoreStatus,
	TimeBuoyAllQueryResult,
	TimeBuoyQueryResult,
} from "../types/fileMemo";
import type { MemoRecord } from "../types/memo";
import type { KnomoSettings } from "../types/settings";
import { formatLocalIsoString, formatMonthPeriod } from "../utils/date";
import { formatMemoFilenameTimestamp, parseMemoFilenameTimestamp, toSafeMemoFileStem } from "../utils/fileMemoName";
import { hashMemoContent, hashText } from "../utils/hash";
import { restoreMemoFrontmatter } from "../utils/memoFrontmatter";
import { extractTimeBuoyDates, getTimeBuoyRevision } from "../utils/timeBuoyParser";
import { PLAIN_MEMO_DATA_FOLDER, PLAIN_MEMO_PICTURE_FOLDER } from "../constants";

type GetSettings = () => KnomoSettings;

interface CachedMemo {
	mtime: number;
	size: number;
	memo: MemoRecord | null;
}

interface PendingMemoRead {
	mtime: number;
	size: number;
	promise: Promise<MemoRecord | null>;
}

export interface MemoLoadPage {
	memos: MemoRecord[];
	nextOffset: number;
	total: number;
}

export interface MemoLoadOptions {
	concurrency?: number;
	timeBudgetMs?: number;
	yieldToUi?: () => Promise<void>;
}

interface ReferenceHint {
	sourceMemoId: string | null;
	sourceReferenceText: string | null;
}

const TRASH_FOLDER_NAME = "_knomo-trash";
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;
export const MOBILE_INITIAL_MEMO_COUNT = 50;
const DEFAULT_BACKGROUND_READ_CONCURRENCY = 4;
const DEFAULT_BACKGROUND_TIME_BUDGET_MS = 4;

/** Maps standalone Markdown files into the existing card model. */
export class FileMemoOrchestrator {
	private readonly markdown = new MarkdownBlockService();
	private readonly cache = new Map<string, CachedMemo>();
	private readonly pendingReads = new Map<string, PendingMemoRead>();

	constructor(
		private readonly app: App,
		private readonly getSettings: GetSettings,
		private readonly managedPictures = new ManagedPictureService(app),
	) {}

	getDailyNotesStatus(): MemoStoreStatus {
		const defaultFolder = this.getSettings().defaultMemoFolder ?? "";
		const configured = defaultFolder.length > 0;
		return {
			enabled: configured,
			folder: configured ? defaultFolder : null,
			format: null,
			message: configured ? "Standalone memo files are enabled." : "Choose a default memo folder in PlainMemo settings.",
		};
	}

	/** A virtual source file gives Obsidian the correct folder for new links and attachments. */
	getTodayDailyNotePath(): string | null {
		const folder = this.getSettings().defaultMemoFolder ?? "";
		return folder.length > 0 ? normalizePath(`${folder}/_knomo-composer.md`) : null;
	}

	isRelevantVaultPath(path: string): boolean {
		if (!path.toLowerCase().endsWith(".md")) return false;
		if (isReservedPlainMemoPath(path)) return false;
		return this.getScanFolders().some((folder) => path === folder || path.startsWith(`${folder}/`));
	}

	getActiveMemoFiles(): TFile[] {
		return this.app.vault.getMarkdownFiles().filter((file) => this.isActiveMemoFile(file));
	}

	invalidatePath(path: string): void {
		this.cache.delete(path);
		this.pendingReads.delete(path);
	}

	invalidateAll(): void {
		this.cache.clear();
		this.pendingReads.clear();
	}

	async createMemoWithTimeBuoyOutcome(
		input: string,
		options: CreateMemoOptions = {},
	): Promise<{ result: CreateMemoResult; timeBuoy: { status: "synced"; dates: string[] } }> {
		const content = normalizeContent(input);
		if (!content) throw new Error("Memo content cannot be empty.");
		const folder = this.getSettings().defaultMemoFolder ?? "";
		if (!folder) throw new Error("Choose a default memo folder in PlainMemo settings first.");
		await this.ensureFolder(folder);
		const now = new Date();
		const base = `${toSafeMemoFileStem(firstLine(content))}_${formatMemoFilenameTimestamp(now)}`;
		const path = await this.allocatePath(folder, base);
		const file = await this.app.vault.create(path, content);
		const hint = toReferenceHint(options);
		const memo = await this.readFile(file, now, hint);
		this.cacheMemo(file, memo);
		return {
			result: { memo, opId: `file-${Date.now()}` },
			timeBuoy: { status: "synced", dates: extractTimeBuoyDates(content) },
		};
	}

	async updateMemo(memo: MemoRecord, input: string): Promise<MemoRecord> {
		const file = this.requireFile(memo.dailyRef.path);
		const editedBody = normalizeContent(input);
		if (!editedBody) throw new Error("Memo content cannot be empty.");
		const content = restoreMemoFrontmatter(memo.contentSnapshot, editedBody);
		const previousPictures = this.managedPictures.findReferencedPictures(memo.contentSnapshot, file.path);
		const nextPictures = new Set(this.managedPictures.findReferencedPictures(content, file.path));
		const removedPictures = previousPictures.filter((path) => !nextPictures.has(path));
		await this.app.vault.modify(file, content);
		this.cache.delete(file.path);
		const updated = await this.readFile(file, undefined, {
			sourceMemoId: memo.sourceMemoId,
			sourceReferenceText: memo.references[0]?.referenceText ?? null,
		});
		this.cacheMemo(file, updated);
		await this.cleanupManagedPictures(removedPictures);
		return updated;
	}

	async updateMemoWithTimeBuoyOutcome(
		memo: MemoRecord,
		input: string,
	): Promise<{ memo: MemoRecord; timeBuoy: { status: "synced"; dates: string[] } }> {
		const updated = await this.updateMemo(memo, input);
		return { memo: updated, timeBuoy: { status: "synced", dates: extractTimeBuoyDates(updated.contentSnapshot) } };
	}

	async deleteMemo(memo: MemoRecord): Promise<MemoRecord> {
		const file = this.requireFile(memo.dailyRef.path);
		const trashRoot = this.getTrashRoot();
		await this.ensureFolder(trashRoot);
		const requestedPath = normalizePath(`${trashRoot}/${file.path}`);
		const trashPath = await this.allocateFullPath(requestedPath);
		await this.ensureFolder(parentPath(trashPath));
		await this.app.vault.rename(file, trashPath);
		this.cache.delete(memo.dailyRef.path);
		const moved = this.requireFile(trashPath);
		return this.readDeletedFile(moved);
	}

	async listMemos(): Promise<MemoRecord[]> { return this.listActiveFiles(); }
	async listRecentMemos(): Promise<MemoRecord[]> {
		const plan = this.createMemoLoadPlan();
		return (await this.loadMemoPage(plan, 0, MOBILE_INITIAL_MEMO_COUNT)).memos;
	}
	/** Builds a content-free, stable snapshot used by count-based mobile pagination. */
	createMemoLoadPlan(): string[] {
		return this.app.vault.getMarkdownFiles()
			.filter((file) => this.isActiveMemoFile(file))
			.sort(compareMemoFilesForLoading)
			.map((file) => file.path);
	}

	async loadMemoPage(
		plan: readonly string[],
		offset: number,
		limit: number,
		options: MemoLoadOptions = {},
	): Promise<MemoLoadPage> {
		const start = Math.max(0, Math.min(plan.length, Math.floor(offset)));
		const size = Math.max(0, Math.floor(limit));
		const end = Math.min(plan.length, start + size);
		const paths = plan.slice(start, end);
		const concurrency = Math.max(1, Math.floor(options.concurrency ?? DEFAULT_BACKGROUND_READ_CONCURRENCY));
		const timeBudgetMs = Math.max(1, options.timeBudgetMs ?? DEFAULT_BACKGROUND_TIME_BUDGET_MS);
		const memos: MemoRecord[] = [];
		let sliceStartedAt = performance.now();
		for (let index = 0; index < paths.length; index += concurrency) {
			const group = paths.slice(index, index + concurrency);
			const results = await Promise.all(group.map((path) => this.readPlannedPath(path)));
			for (const memo of results) {
				if (memo !== null) memos.push(memo);
			}
			if (options.yieldToUi !== undefined && performance.now() - sliceStartedAt >= timeBudgetMs) {
				await options.yieldToUi();
				sliceStartedAt = performance.now();
			}
		}
		return { memos, nextOffset: end, total: plan.length };
	}

	/** Reads explicitly selected memo paths without scanning the rest of the vault. */
	async loadMemosByPath(paths: readonly string[]): Promise<MemoRecord[]> {
		const memos = await Promise.all(paths.map((path) => this.readPlannedPath(path)));
		return memos.filter((memo): memo is MemoRecord => memo !== null);
	}

	async getDeletedMemoSummary(): Promise<DeletedMemoSummary> {
		const memos = await this.listDeletedMemos();
		return { count: memos.length, ids: memos.map((memo) => memo.id) };
	}

	async listDeletedMemos(): Promise<MemoRecord[]> {
		const files = this.app.vault.getMarkdownFiles().filter((file) => this.isManagedTrashPath(file.path));
		const memos = await Promise.all(files.map((file) => this.readDeletedFile(file)));
		return memos.sort((left, right) => (right.deletedAt ?? "").localeCompare(left.deletedAt ?? ""));
	}

	async restoreMemoRecord(memo: MemoRecord): Promise<MemoRecord> {
		const file = this.requireFile(memo.dailyRef.path);
		const originalPath = this.getOriginalPathFromTrash(file.path);
		if (originalPath === null) throw new Error("The original memo path cannot be recovered.");
		const restorePath = await this.allocateFullPath(originalPath);
		await this.ensureFolder(parentPath(restorePath));
		await this.app.vault.rename(file, restorePath);
		const restoredFile = this.requireFile(restorePath);
		const restored = await this.readFile(restoredFile);
		this.cacheMemo(restoredFile, restored);
		return restored;
	}

	async purgeDeletedMemoRecord(memo: MemoRecord): Promise<void> {
		const file = this.requireFile(memo.dailyRef.path);
		if (!this.isManagedTrashPath(file.path)) throw new Error("Only memos in PlainMemo trash can be permanently deleted.");
		const pictures = this.managedPictures.findReferencedPictures(memo.contentSnapshot, file.path);
		const deletedPath = file.path;
		await this.app.fileManager.trashFile(file);
		await this.cleanupManagedPictures(pictures, [deletedPath]);
	}

	/** Permanently removes PlainMemo trash entries whose deletion time exceeds the configured retention period. */
	async purgeExpiredDeletedMemos(now = Date.now()): Promise<{ purged: number; failed: string[] }> {
		const retentionDays = Math.max(1, Math.floor(this.getSettings().trashRetentionDays ?? 30));
		const cutoff = now - retentionDays * MILLISECONDS_PER_DAY;
		const expiredFiles = this.app.vault.getMarkdownFiles()
			.filter((file) => this.isManagedTrashPath(file.path) && file.stat.mtime <= cutoff)
			.sort((left, right) => left.stat.mtime - right.stat.mtime || left.path.localeCompare(right.path));
		let purged = 0;
		const failed: string[] = [];
		for (const file of expiredFiles) {
			try {
				await this.purgeDeletedMemoRecord(await this.readDeletedFile(file));
				purged += 1;
			} catch (error) {
				failed.push(file.path);
				console.error(`PlainMemo failed to purge expired trash entry: ${file.path}`, error);
			}
		}
		return { purged, failed };
	}

	/** Cleans managed pictures without turning a successful memo mutation into a save failure. */
	private async cleanupManagedPictures(paths: readonly string[], excludedMarkdownPaths: readonly string[] = []): Promise<void> {
		if (paths.length === 0) return;
		try {
			await this.managedPictures.trashUnreferenced(paths, excludedMarkdownPaths);
		} catch (error) {
			console.error("PlainMemo failed to clean unreferenced managed pictures", error);
		}
	}

	async buildRecordStats(
		yieldToUi: () => Promise<void>,
		isCurrent: () => boolean,
	): Promise<PreparedRecordStats | null> {
		const builder = new RecordStatsBuilder();
		for (const memo of await this.listActiveFiles()) {
			if (!isCurrent()) return null;
			builder.addMemo(memo);
			await yieldToUi();
		}
		return builder.build();
	}

	async queryTimeBuoysForDate(targetDate: string, loadedMemos?: readonly MemoRecord[]): Promise<TimeBuoyQueryResult> {
		const memos = loadedMemos ?? await this.listActiveFiles();
		const items = memos.flatMap((memo) => extractTimeBuoyDates(memo.contentSnapshot)
			.filter((date) => date === targetDate)
			.map((date) => ({ instance: createTimeBuoyInstance(memo, date), memo })));
		return { items, stale: [], missingPeriods: [] };
	}

	async queryAllTimeBuoys(loadedMemos?: readonly MemoRecord[]): Promise<TimeBuoyAllQueryResult> {
		const memos = loadedMemos ?? await this.listActiveFiles();
		const items = memos.flatMap((memo) => extractTimeBuoyDates(memo.contentSnapshot)
			.map((date) => ({ instance: createTimeBuoyInstance(memo, date), memo })))
			.sort((left, right) => left.instance.targetDate.localeCompare(right.instance.targetDate)
				|| right.memo.createdAt.localeCompare(left.memo.createdAt));
		return { items, stale: [], missingPeriods: [], complete: true };
	}

	private async listActiveFiles(): Promise<MemoRecord[]> {
		const plan = this.createMemoLoadPlan();
		const activePaths = new Set(plan);
		for (const path of this.cache.keys()) if (!activePaths.has(path)) this.cache.delete(path);
		return (await this.loadMemoPage(plan, 0, plan.length, {
			concurrency: Math.min(16, Math.max(DEFAULT_BACKGROUND_READ_CONCURRENCY, plan.length)),
		})).memos;
	}

	private isActiveMemoFile(file: TFile): boolean {
		return !this.isManagedTrashPath(file.path)
			&& !isReservedPlainMemoPath(file.path)
			&& this.getScanFolders().some((folder) => file.path.startsWith(`${folder}/`))
			&& parseMemoFilenameTimestamp(file.name) !== null;
	}

	private async readCachedFile(file: TFile): Promise<MemoRecord | null> {
		const cached = this.cache.get(file.path);
		if (cached !== undefined && cached.mtime === file.stat.mtime && cached.size === file.stat.size) return cached.memo;
		const pending = this.pendingReads.get(file.path);
		if (pending !== undefined && pending.mtime === file.stat.mtime && pending.size === file.stat.size) {
			return pending.promise;
		}
		const mtime = file.stat.mtime;
		const size = file.stat.size;
		let promise: Promise<MemoRecord | null>;
		promise = this.readFile(file).then((memo) => {
			const current = this.pendingReads.get(file.path);
			if (current?.promise !== promise || file.stat.mtime !== mtime || file.stat.size !== size) return memo;
			if (!memo.contentSnapshot.trim()) {
				this.cache.set(file.path, { mtime, size, memo: null });
				return null;
			}
			this.cache.set(file.path, { mtime, size, memo });
			return memo;
		}).finally(() => {
			if (this.pendingReads.get(file.path)?.promise === promise) this.pendingReads.delete(file.path);
		});
		this.pendingReads.set(file.path, { mtime, size, promise });
		return promise;
	}

	private async readPlannedPath(path: string): Promise<MemoRecord | null> {
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile && this.isActiveMemoFile(file) ? this.readCachedFile(file) : null;
	}

	private async readFile(file: TFile, fallback?: Date, hint?: ReferenceHint): Promise<MemoRecord> {
		const content = normalizeContent(await this.app.vault.cachedRead(file));
		const created = parseMemoFilenameTimestamp(file.name) ?? fallback ?? new Date(file.stat.ctime);
		const metadata = this.markdown.parseMemoMetadata(content);
		const contentHash = hashMemoContent(content);
		const reference = this.resolveReference(content, file.path, hint);
		return {
			id: file.path,
			createdAt: formatLocalIsoString(created),
			updatedAt: new Date(file.stat.mtime).toISOString(),
			contentSnapshot: content,
			contentHash,
			status: "active",
			syncStatus: "synced",
			source: reference === null ? "plugin_input" : "quote_create",
			version: 1,
			tags: metadata.tags,
			links: metadata.links,
			images: metadata.images,
			references: reference === null ? [] : [{ memoId: reference.sourceMemoId, referenceText: reference.referenceText }],
			sourceMemoId: reference?.sourceMemoId ?? null,
			issue: null,
			lastMarkdownSyncAt: null,
			lastMarkdownSyncSource: null,
			dailyRef: {
				path: file.path,
				heading: null,
				lastKnownBlock: content,
				lastKnownHash: hashText(content),
				lineNumberHint: 1,
				lastSyncedAt: null,
			},
			monthlyRef: { path: "", dateHeading: "", lastKnownBlock: "", lastKnownHash: "", lineNumberHint: null, lastSyncedAt: null },
		};
	}

	private async readDeletedFile(file: TFile): Promise<MemoRecord> {
		const active = await this.readFile(file);
		const originalPath = this.getOriginalPathFromTrash(file.path) ?? file.path;
		return {
			...active,
			id: originalPath,
			status: "deleted",
			deletedAt: new Date(file.stat.mtime).toISOString(),
			deleteSource: "plugin",
		};
	}

	private resolveReference(content: string, sourcePath: string, hint?: ReferenceHint): { sourceMemoId: string; referenceText: string } | null {
		if (hint?.sourceMemoId && hint.sourceReferenceText && content.includes(hint.sourceReferenceText)) {
			return { sourceMemoId: hint.sourceMemoId, referenceText: hint.sourceReferenceText };
		}
		if (!content.split("\n").some((line) => /^\s*>/.test(line))) return null;
		const pattern = /(!?\[\[([^\]]+)\]\])/g;
		let match = pattern.exec(content);
		while (match !== null) {
			const rawTarget = match[2].split("|")[0].split("#")[0].trim();
			const target = this.app.metadataCache.getFirstLinkpathDest(rawTarget, sourcePath);
			if (target instanceof TFile && target.path !== sourcePath && parseMemoFilenameTimestamp(target.name) !== null) {
				return { sourceMemoId: target.path, referenceText: match[1] };
			}
			match = pattern.exec(content);
		}
		return null;
	}

	private cacheMemo(file: TFile, memo: MemoRecord): void {
		this.cache.set(file.path, { mtime: file.stat.mtime, size: file.stat.size, memo });
	}

	private getScanFolders(): string[] {
		return this.getSettings().memoFolders ?? [];
	}

	private getTrashRoot(): string {
		const folder = this.getSettings().defaultMemoFolder ?? "";
		if (!folder) throw new Error("Choose a default memo folder before deleting memos.");
		return normalizePath(`${folder}/${TRASH_FOLDER_NAME}`);
	}

	private isManagedTrashPath(path: string): boolean {
		return this.getScanFolders().some((folder) => path.startsWith(`${folder}/`) && path.includes(`/${TRASH_FOLDER_NAME}/`));
	}

	private getOriginalPathFromTrash(path: string): string | null {
		const marker = `/${TRASH_FOLDER_NAME}/`;
		const markerIndex = path.indexOf(marker);
		return markerIndex === -1 ? null : path.slice(markerIndex + marker.length);
	}

	private requireFile(path: string): TFile {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error("Memo file no longer exists.");
		return file;
	}

	private async ensureFolder(path: string): Promise<void> {
		if (path && this.app.vault.getAbstractFileByPath(path) === null) await this.app.vault.createFolder(path);
	}

	private async allocatePath(folder: string, base: string): Promise<string> {
		return this.allocateFullPath(normalizePath(`${folder}/${base}.md`));
	}

	private async allocateFullPath(requestedPath: string): Promise<string> {
		if (this.app.vault.getAbstractFileByPath(requestedPath) === null) return requestedPath;
		const extensionIndex = requestedPath.toLowerCase().lastIndexOf(".md");
		const base = extensionIndex === -1 ? requestedPath : requestedPath.slice(0, extensionIndex);
		const extension = extensionIndex === -1 ? "" : requestedPath.slice(extensionIndex);
		for (let suffix = 2; ; suffix += 1) {
			const candidate = `${base} (${suffix})${extension}`;
			if (this.app.vault.getAbstractFileByPath(candidate) === null) return candidate;
		}
	}
}

function normalizeContent(value: string): string {
	return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function firstLine(value: string): string {
	return value.split("\n", 1)[0].trim();
}

function parentPath(path: string): string {
	const separatorIndex = path.lastIndexOf("/");
	return separatorIndex === -1 ? "" : path.slice(0, separatorIndex);
}

function toReferenceHint(options: CreateMemoOptions): ReferenceHint | undefined {
	const sourceMemoId = options.sourceMemoId ?? null;
	const sourceReferenceText = options.sourceReferenceText ?? null;
	return sourceMemoId === null ? undefined : { sourceMemoId, sourceReferenceText };
}

function createTimeBuoyInstance(memo: MemoRecord, targetDate: string) {
	return {
		memoId: memo.id,
		targetDate,
		sourcePeriod: formatMonthPeriod(new Date(memo.createdAt)),
		buoyRevision: getTimeBuoyRevision(memo.contentSnapshot),
	};
}

function compareMemoFilesForLoading(left: TFile, right: TFile): number {
	const leftTimestamp = parseMemoFilenameTimestamp(left.name)?.getTime() ?? 0;
	const rightTimestamp = parseMemoFilenameTimestamp(right.name)?.getTime() ?? 0;
	if (leftTimestamp !== rightTimestamp) return rightTimestamp - leftTimestamp;
	const leftCollision = parseCollisionOrder(left.path);
	const rightCollision = parseCollisionOrder(right.path);
	if (leftCollision.stem === rightCollision.stem && leftCollision.order !== rightCollision.order) {
		return rightCollision.order - leftCollision.order;
	}
	return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

function parseCollisionOrder(name: string): { stem: string; order: number } {
	const match = /^(.*_\d{10})(?: \((\d+)\))?\.md$/i.exec(name);
	return match === null
		? { stem: name.toLowerCase(), order: 1 }
		: { stem: match[1].toLowerCase(), order: match[2] === undefined ? 1 : Number(match[2]) };
}

/** Excludes PlainMemo state and image directories from every memo scan scope. */
export function isReservedPlainMemoPath(path: string): boolean {
	return path === PLAIN_MEMO_DATA_FOLDER
		|| path.startsWith(`${PLAIN_MEMO_DATA_FOLDER}/`)
		|| path === PLAIN_MEMO_PICTURE_FOLDER
		|| path.startsWith(`${PLAIN_MEMO_PICTURE_FOLDER}/`);
}
