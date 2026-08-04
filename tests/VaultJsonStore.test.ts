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
});

async function createHarness() {
	await ensureObsidianStub();
	const { TFile, TFolder } = await import("obsidian");
	const { VaultJsonStore } = await import("../src/services/VaultJsonStore");
	const files = new Map<string, InstanceType<typeof TFile>>();
	const folders = new Set<string>();
	const folderEntries = new Map<string, InstanceType<typeof TFolder>>();
	const contents = new Map<string, string>();
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
			getAbstractFileByPath: (path: string) => files.get(path) ?? folderEntries.get(path) ?? null,
			getFiles: () => [...files.values()],
			cachedRead: async (file: InstanceType<typeof TFile>) => contents.get(file.path) ?? "",
			createFolder: async (path: string) => {
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
	return { store: new VaultJsonStore(app as never), folders, contents };
}
