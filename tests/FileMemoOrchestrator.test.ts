import test from "node:test";
import assert from "node:assert/strict";

import { ensureObsidianStub } from "./helpers/obsidianStub";
import type { KnomoSettings } from "../src/types/settings";

test("standalone memo store scans valid non-empty files and reuses unchanged reads", async () => {
	const harness = await createHarness([
		["Flomo/Valid_2607250855.md", "Valid\nBody"],
		["Flomo/Empty_2607250856.md", ""],
		["Flomo/Invalid_2699329999.md", "Invalid date"],
		["Other/Ignored_2607250857.md", "Ignored"],
	]);

	const first = await harness.store.listMemos();
	const readsAfterFirstScan = harness.readCount;
	const second = await harness.store.listMemos();

	assert.deepEqual(first.map((memo) => memo.id), ["Flomo/Valid_2607250855.md"]);
	assert.equal(second.length, 1);
	assert.equal(harness.readCount, readsAfterFirstScan);
});

test("PlainMemo data and picture directories are never scanned as cards", async () => {
	const harness = await createHarness([
		["PlainMemo/Visible_2607250855.md", "Visible"],
		["PlainMemo/data/Hidden_2607250856.md", "Hidden"],
		["PlainMemo/picture/Image_2607250857.md", "Image"],
	]);
	harness.settings.memoFolders = ["PlainMemo"];

	assert.deepEqual((await harness.store.listMemos()).map((memo) => memo.id), ["PlainMemo/Visible_2607250855.md"]);
});

test("standalone memo load plans sort by filename time and apply stable collision ordering", async () => {
	const harness = await createHarness([
		["Flomo/Beta_2607250855.md", "Beta"],
		["Flomo/Alpha_2607250855.md", "Alpha one"],
		["Flomo/Alpha_2607250855 (2).md", "Alpha two"],
		["Flomo/Newest_2607250856.md", "Newest"],
	]);

	const plan = harness.store.createMemoLoadPlan();
	const firstPage = await harness.store.loadMemoPage(plan, 0, 2);
	const secondPage = await harness.store.loadMemoPage(plan, firstPage.nextOffset, 2);

	assert.deepEqual(plan, [
		"Flomo/Newest_2607250856.md",
		"Flomo/Alpha_2607250855 (2).md",
		"Flomo/Alpha_2607250855.md",
		"Flomo/Beta_2607250855.md",
	]);
	assert.deepEqual(firstPage.memos.map((memo) => memo.id), plan.slice(0, 2));
	assert.deepEqual(secondPage.memos.map((memo) => memo.id), plan.slice(2));
});

test("standalone memo store shares in-flight reads between concurrent consumers", async () => {
	const harness = await createHarness([
		["Flomo/One_2607250855.md", "One"],
		["Flomo/Two_2607250854.md", "Two"],
	]);
	const plan = harness.store.createMemoLoadPlan();

	const [first, second] = await Promise.all([
		harness.store.loadMemoPage(plan, 0, 2),
		harness.store.loadMemoPage(plan, 0, 2),
	]);

	assert.equal(first.memos.length, 2);
	assert.equal(second.memos.length, 2);
	assert.equal(harness.readCount, 2);
});

test("standalone memo store creates, trashes, restores, and purges Markdown files", async () => {
	const harness = await createHarness([]);
	const created = await harness.store.createMemoWithTimeBuoyOutcome("First line\nBody");
	const createdPath = created.result.memo.dailyRef.path;
	assert.match(createdPath, /^Flomo\/First line_\d{10}\.md$/);
	assert.equal(harness.contents.get(createdPath), "First line\nBody");

	const deleted = await harness.store.deleteMemo(created.result.memo);
	assert.equal(deleted.status, "deleted");
	assert.match(deleted.dailyRef.path, /^Flomo\/_knomo-trash\/Flomo\/First line_\d{10}\.md$/);
	assert.equal((await harness.store.getDeletedMemoSummary()).count, 1);

	const restored = await harness.store.restoreMemoRecord(deleted);
	assert.equal(restored.status, "active");
	assert.equal(restored.dailyRef.path, createdPath);
	assert.equal((await harness.store.getDeletedMemoSummary()).count, 0);

	const deletedAgain = await harness.store.deleteMemo(restored);
	await harness.store.purgeDeletedMemoRecord(deletedAgain);
	assert.equal((await harness.store.getDeletedMemoSummary()).count, 0);
});

test("editing a memo trashes only removed managed pictures without other references", async () => {
	const harness = await createHarness([
		["Flomo/Pictures_2607250855.md", "Body\n![[PlainMemo/picture/orphan.png]]\n![[PlainMemo/picture/shared.png]]"],
		["Notes/shared.md", "[shared](PlainMemo/picture/shared.png)"],
		["PlainMemo/picture/orphan.png", "orphan"],
		["PlainMemo/picture/shared.png", "shared"],
	]);
	const memo = (await harness.store.listMemos())[0];

	await harness.store.updateMemo(memo, "Body");

	assert.equal(harness.hasFile("PlainMemo/picture/orphan.png"), false);
	assert.equal(harness.hasFile("PlainMemo/picture/shared.png"), true);
	assert.deepEqual(harness.trashedPaths, ["PlainMemo/picture/orphan.png"]);
});

test("soft deletion preserves managed pictures and permanent deletion cleans the last reference", async () => {
	const harness = await createHarness([
		["Flomo/Pictures_2607250855.md", "Body\n![[PlainMemo/picture/photo.png]]"],
		["PlainMemo/picture/photo.png", "photo"],
	]);
	const memo = (await harness.store.listMemos())[0];

	const deleted = await harness.store.deleteMemo(memo);
	assert.equal(harness.hasFile("PlainMemo/picture/photo.png"), true);

	await harness.store.purgeDeletedMemoRecord(deleted);

	assert.equal(harness.hasFile("PlainMemo/picture/photo.png"), false);
	assert.equal(harness.trashedPaths.includes("PlainMemo/picture/photo.png"), true);
});

test("automatic trash cleanup purges only expired memos and unreferenced managed pictures", async () => {
	const harness = await createHarness([
		["Flomo/_knomo-trash/Flomo/Old_2607250855.md", "Old\n![[PlainMemo/picture/orphan.png]]\n![[PlainMemo/picture/shared.png]]"],
		["Flomo/_knomo-trash/Flomo/Recent_2607250856.md", "Recent\n![[PlainMemo/picture/recent.png]]"],
		["Notes/shared.md", "[shared](PlainMemo/picture/shared.png)"],
		["PlainMemo/picture/orphan.png", "orphan"],
		["PlainMemo/picture/shared.png", "shared"],
		["PlainMemo/picture/recent.png", "recent"],
	]);
	const now = Date.UTC(2026, 7, 4);
	harness.settings.trashRetentionDays = 30;
	harness.setMtime("Flomo/_knomo-trash/Flomo/Old_2607250855.md", now - 31 * 24 * 60 * 60 * 1_000);
	harness.setMtime("Flomo/_knomo-trash/Flomo/Recent_2607250856.md", now - 29 * 24 * 60 * 60 * 1_000);

	const result = await harness.store.purgeExpiredDeletedMemos(now);

	assert.deepEqual(result, { purged: 1, failed: [] });
	assert.equal(harness.hasFile("Flomo/_knomo-trash/Flomo/Old_2607250855.md"), false);
	assert.equal(harness.hasFile("Flomo/_knomo-trash/Flomo/Recent_2607250856.md"), true);
	assert.equal(harness.hasFile("PlainMemo/picture/orphan.png"), false);
	assert.equal(harness.hasFile("PlainMemo/picture/shared.png"), true);
	assert.equal(harness.hasFile("PlainMemo/picture/recent.png"), true);
});

async function createHarness(initialFiles: Array<[string, string]>) {
	await ensureObsidianStub();
	const { TFile } = await import("obsidian");
	const { FileMemoOrchestrator } = await import("../src/services/FileMemoOrchestrator");
	const files = new Map<string, InstanceType<typeof TFile>>();
	const contents = new Map<string, string>();
	const folders = new Set<string>();
	const trashedPaths: string[] = [];
	let clock = 1;
	let readCount = 0;

	const makeFile = (path: string, content: string) => {
		const name = path.split("/").at(-1) ?? path;
		const extensionIndex = name.lastIndexOf(".");
		const file = Object.assign(new TFile(), {
			path,
			name,
			basename: extensionIndex === -1 ? name : name.slice(0, extensionIndex),
			extension: extensionIndex === -1 ? "" : name.slice(extensionIndex + 1),
			stat: { ctime: clock, mtime: clock, size: content.length },
		});
		clock += 1;
		files.set(path, file);
		contents.set(path, content);
		return file;
	};
	for (const [path, content] of initialFiles) makeFile(path, content);

	const app = {
		fileManager: {
			trashFile: async (file: InstanceType<typeof TFile>) => {
				trashedPaths.push(file.path);
				files.delete(file.path);
				contents.delete(file.path);
			},
		},
		vault: {
			getMarkdownFiles: () => [...files.values()].filter((file) => file.extension === "md"),
			getAbstractFileByPath: (path: string) => files.get(path) ?? (folders.has(path) ? { path } : null),
			cachedRead: async (file: InstanceType<typeof TFile>) => {
				readCount += 1;
				return contents.get(file.path) ?? "";
			},
			createFolder: async (path: string) => { folders.add(path); },
			create: async (path: string, content: string) => makeFile(path, content),
			modify: async (file: InstanceType<typeof TFile>, content: string) => {
				contents.set(file.path, content);
				file.stat = { ...file.stat, mtime: clock, size: content.length };
				clock += 1;
			},
			rename: async (file: InstanceType<typeof TFile>, path: string) => {
				const content = contents.get(file.path) ?? "";
				files.delete(file.path);
				contents.delete(file.path);
				file.path = path;
				file.name = path.split("/").at(-1) ?? path;
				file.basename = file.name.replace(/\.md$/i, "");
				file.stat = { ...file.stat, mtime: clock };
				clock += 1;
				files.set(path, file);
				contents.set(path, content);
			},
		},
		metadataCache: {
			getFirstLinkpathDest: (rawPath: string) => {
				const decoded = decodeURI(rawPath).replace(/^\/+/, "");
				const exact = files.get(decoded);
				if (exact !== undefined) return exact;
				const matches = [...files.values()].filter((file) => file.name === decoded);
				return matches.length === 1 ? matches[0] : null;
			},
		},
	};
	const settings = {
		memoFolders: ["Flomo"],
		defaultMemoFolder: "Flomo",
	} as KnomoSettings;
	const store = new FileMemoOrchestrator(app as never, () => settings);
	return {
		store,
		contents,
		settings,
		trashedPaths,
		hasFile: (path: string) => files.has(path),
		setMtime: (path: string, mtime: number) => {
			const file = files.get(path);
			if (file !== undefined) file.stat = { ...file.stat, mtime };
		},
		get readCount() { return readCount; },
	};
}
