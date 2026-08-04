import test from "node:test";
import assert from "node:assert/strict";

import { copyFlomoAttachments } from "../src/services/FlomoImportService";
import type { ManagedPictureService } from "../src/services/ManagedPictureService";
import { ensureObsidianStub } from "./helpers/obsidianStub";

test("copies Flomo attachments through the managed PlainMemo picture store", async () => {
	const calls: Array<{ name: string; data: string; reuseIdentical: boolean }> = [];
	const managedPictures = {
		createBinary: async (name: string, data: Uint8Array, reuseIdentical: boolean) => {
			calls.push({ name, data: new TextDecoder().decode(data), reuseIdentical });
			return { path: `PlainMemo/picture/${name}` };
		},
	} as ManagedPictureService;

	const links = await copyFlomoAttachments(
		{} as never,
		managedPictures,
		"Imported",
		["assets/photo.png", "assets/missing.jpg", "assets/photo.png"],
		new Map([["assets/photo.png", new TextEncoder().encode("photo")]]),
	);

	assert.deepEqual(calls, [{ name: "photo.png", data: "photo", reuseIdentical: true }]);
	assert.deepEqual([...links.entries()], [["assets/photo.png", "![[PlainMemo/picture/photo.png]]"]]);
});

test("keeps optional Flomo audio outside the managed picture directory", async () => {
	await ensureObsidianStub();
	const { TFile, TFolder } = await import("obsidian");
	const files = new Map<string, InstanceType<typeof TFile>>();
	const folders = new Map<string, InstanceType<typeof TFolder>>();
	const app = {
		vault: {
			adapter: { stat: async (path: string) => folders.has(path) ? { type: "folder" } : null },
			getAbstractFileByPath: (path: string) => files.get(path) ?? folders.get(path) ?? null,
			createFolder: async (path: string) => {
				folders.set(path, Object.assign(new TFolder(), { path, name: path.split("/").at(-1) ?? path, children: [] }));
			},
			createBinary: async (path: string) => {
				const name = path.split("/").at(-1) ?? path;
				const file = Object.assign(new TFile(), { path, name, extension: "m4a", basename: name.replace(/\.m4a$/i, "") });
				files.set(path, file);
				return file;
			},
			readBinary: async () => new ArrayBuffer(0),
		},
	};
	const managedPictures = {
		createBinary: async () => { throw new Error("Audio must not use the picture store."); },
	} as unknown as ManagedPictureService;

	const links = await copyFlomoAttachments(
		app as never,
		managedPictures,
		"Imported",
		["assets/voice.m4a"],
		new Map([["assets/voice.m4a", new Uint8Array([1, 2, 3])]]),
	);

	assert.deepEqual([...links.entries()], [["assets/voice.m4a", "![[Imported/flomo-attachments/voice.m4a]]"]]);
});
