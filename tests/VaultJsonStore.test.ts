import test from "node:test";
import assert from "node:assert/strict";

import { ensureObsidianStub } from "./helpers/obsidianStub";

test("creates PlainMemo folders without eagerly creating state files", async () => {
	const harness = await createHarness();

	await harness.store.ensureFolder("PlainMemo/data");
	await harness.store.ensureFolder("PlainMemo/picture");

	assert.deepEqual([...harness.folders].sort(), ["PlainMemo", "PlainMemo/data", "PlainMemo/picture"]);
	assert.equal(harness.contents.size, 0);
});

test("accepts folders that exist on disk before the mobile Vault index is ready", async () => {
	const harness = await createHarness();
	harness.addDiskFolder("PlainMemo");
	harness.addDiskFolder("PlainMemo/data");
	harness.addDiskFolder("PlainMemo/picture");

	await harness.store.ensureFolder("PlainMemo/data");
	await harness.store.ensureFolder("PlainMemo/picture");

	assert.equal(harness.createFolderCalls(), 0);
});

test("reads synchronized JSON before the mobile Vault index catches up", async () => {
	const harness = await createHarness();
	harness.addDiskFolder("PlainMemo");
	harness.addDiskFolder("PlainMemo/data");
	harness.addDiskFolder("PlainMemo/data/pins");
	harness.addDiskFile("PlainMemo/data/settings.json", JSON.stringify({ memoFolders: ["Synced"] }));
	harness.addDiskFile("PlainMemo/data/pins/mobile.json", JSON.stringify({ path: "Synced/a.md" }));

	assert.deepEqual(await harness.store.read("PlainMemo/data/settings.json"), { memoFolders: ["Synced"] });
	assert.deepEqual(await harness.store.list("PlainMemo/data/pins"), ["PlainMemo/data/pins/mobile.json"]);

	await harness.store.write("PlainMemo/data/pins/mobile.json", { path: "Synced/b.md" });
	assert.deepEqual(await harness.store.read("PlainMemo/data/pins/mobile.json"), { path: "Synced/b.md" });
});

test("reads, writes, lists, and mutates synchronized JSON files", async () => {
	const harness = await createHarness();

	await harness.store.write("PlainMemo/data/settings.json", { folders: ["PlainMemo"] });
	await harness.store.write("PlainMemo/data/pins/a.json", { path: "PlainMemo/a.md" });
	await harness.store.mutate("PlainMemo/data/settings.json", (savedData) => ({
		nextData: { ...(savedData as Record<string, unknown>), threshold: 8 },
		result: undefined,
	}));

	assert.deepEqual(await harness.store.read("PlainMemo/data/settings.json"), {
		folders: ["PlainMemo"],
		threshold: 8,
	});
	assert.deepEqual(await harness.store.list("PlainMemo/data/pins"), ["PlainMemo/data/pins/a.json"]);
	assert.match(harness.contents.get("PlainMemo/data/settings.json") ?? "", /\n$/);
	assert.equal(await harness.store.deleteIf("PlainMemo/data/pins/a.json", () => false), false);
	assert.equal(await harness.store.deleteIf("PlainMemo/data/pins/a.json", (saved) => (
		(saved as Record<string, unknown>)?.path === "PlainMemo/a.md"
	)), true);
	assert.deepEqual(await harness.store.list("PlainMemo/data/pins"), []);
	assert.equal(await harness.store.read("PlainMemo/data/pins/a.json"), null);
});

async function createHarness() {
	await ensureObsidianStub();
	const { TFile, TFolder } = await import("obsidian");
	const { VaultJsonStore } = await import("../src/services/VaultJsonStore");
	const files = new Map<string, InstanceType<typeof TFile>>();
	const folders = new Set<string>();
	const folderEntries = new Map<string, InstanceType<typeof TFolder>>();
	const contents = new Map<string, string>();
	let createFolderCallCount = 0;
	const makeFile = (path: string, content: string) => {
		const name = path.split("/").at(-1) ?? path;
		const file = Object.assign(new TFile(), {
			path,
			name,
			basename: name.replace(/\.json$/i, ""),
			extension: "json",
		});
		files.set(path, file);
		contents.set(path, content);
		const parentPath = path.slice(0, path.lastIndexOf("/"));
		folderEntries.get(parentPath)?.children.push(file);
		return file;
	};
	const app = {
		vault: {
			adapter: {
				stat: async (path: string) => folders.has(path)
					? { type: "folder" }
					: contents.has(path) ? { type: "file" } : null,
				read: async (path: string) => {
					if (!contents.has(path)) throw new Error("File does not exist.");
					return contents.get(path) ?? "";
				},
				write: async (path: string, content: string) => { contents.set(path, content); },
				remove: async (path: string) => {
					if (!contents.delete(path)) throw new Error("File does not exist.");
				},
				list: async (path: string) => {
					if (!folders.has(path)) throw new Error("Folder does not exist.");
					const prefix = `${path}/`;
					return {
						files: [...contents.keys()].filter((candidate) => candidate.startsWith(prefix) && !candidate.slice(prefix.length).includes("/")),
						folders: [...folders].filter((candidate) => candidate.startsWith(prefix) && !candidate.slice(prefix.length).includes("/")),
					};
				},
			},
			getAbstractFileByPath: (path: string) => files.get(path) ?? folderEntries.get(path) ?? null,
			getFiles: () => [...files.values()],
			cachedRead: async (file: InstanceType<typeof TFile>) => {
				if (!contents.has(file.path)) throw new Error("File does not exist.");
				return contents.get(file.path) ?? "";
			},
			createFolder: async (path: string) => {
				createFolderCallCount += 1;
				if (folders.has(path)) throw new Error("Folder already exists.");
				folders.add(path);
				const folder = Object.assign(new TFolder(), { path, name: path.split("/").at(-1) ?? path });
				folderEntries.set(path, folder);
				const separator = path.lastIndexOf("/");
				if (separator !== -1) folderEntries.get(path.slice(0, separator))?.children.push(folder);
			},
			create: async (path: string, content: string) => makeFile(path, content),
			modify: async (file: InstanceType<typeof TFile>, content: string) => { contents.set(file.path, content); },
		},
	};
	return {
		store: new VaultJsonStore(app as never),
		folders,
		contents,
		addDiskFolder: (path: string) => { folders.add(path); },
		addDiskFile: (path: string, content: string) => { contents.set(path, content); },
		createFolderCalls: () => createFolderCallCount,
	};
}
