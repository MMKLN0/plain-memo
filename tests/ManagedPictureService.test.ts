import test from "node:test";
import assert from "node:assert/strict";

import { ensureObsidianStub } from "./helpers/obsidianStub";

test("stores new pictures in PlainMemo picture with collision-safe names", async () => {
	const harness = await createHarness();
	const first = await harness.service.createBinary("photo.png", bytes("same"));
	const second = await harness.service.createBinary("photo.png", bytes("same"));
	const reused = await harness.service.createBinary("photo.png", bytes("same"), true);
	const sanitized = await harness.service.createBinary("nested\\bad?.jpg", bytes("other"));

	assert.equal(first.path, "PlainMemo/picture/photo.png");
	assert.equal(second.path, "PlainMemo/picture/photo (2).png");
	assert.equal(reused.path, first.path);
	assert.equal(sanitized.path, "PlainMemo/picture/bad_.jpg");
});

test("resolves only local pictures owned by PlainMemo", async () => {
	const harness = await createHarness();
	harness.addFile("PlainMemo/picture/photo.png", "photo");
	harness.addFile("PlainMemo/picture/other one.png", "other");
	harness.addFile("Elsewhere/outside.png", "outside");

	assert.deepEqual(harness.service.findReferencedPictures([
		"![[photo.png]]",
		"![other](PlainMemo/picture/other%20one.png)",
		"![](https://example.com/remote.png)",
		"![[Elsewhere/outside.png]]",
	].join("\n"), "Cards/a.md"), [
		"PlainMemo/picture/other one.png",
		"PlainMemo/picture/photo.png",
	]);
});

test("resolves relative picture links using a memo's path before it entered PlainMemo trash", async () => {
	const harness = await createHarness();
	harness.addFile("PlainMemo/picture/photo.png", "photo");

	assert.deepEqual(harness.service.findReferencedPictures(
		"![[picture/photo.png]]",
		"PlainMemo/_knomo-trash/PlainMemo/Memo_2608041200.md",
	), ["PlainMemo/picture/photo.png"]);
});

test("trashes an unreferenced managed picture while retaining shared and external files", async () => {
	const harness = await createHarness();
	harness.addFile("PlainMemo/picture/orphan.png", "orphan");
	harness.addFile("PlainMemo/picture/shared.png", "shared");
	harness.addFile("Elsewhere/external.png", "external");
	harness.addFile("Notes/shared.md", "[source](PlainMemo/picture/shared.png)");

	const trashed = await harness.service.trashUnreferenced([
		"PlainMemo/picture/orphan.png",
		"PlainMemo/picture/shared.png",
		"Elsewhere/external.png",
	]);

	assert.deepEqual(trashed, ["PlainMemo/picture/orphan.png"]);
	assert.deepEqual(harness.trashedPaths, ["PlainMemo/picture/orphan.png"]);
	assert.equal(harness.hasFile("PlainMemo/picture/shared.png"), true);
	assert.equal(harness.hasFile("Elsewhere/external.png"), true);
});

/** Creates an in-memory Vault harness for managed picture storage and reference scans. */
async function createHarness() {
	await ensureObsidianStub();
	const { TFile, TFolder } = await import("obsidian");
	const { ManagedPictureService } = await import("../src/services/ManagedPictureService");
	const files = new Map<string, InstanceType<typeof TFile>>();
	const folders = new Map<string, InstanceType<typeof TFolder>>();
	const text = new Map<string, string>();
	const binary = new Map<string, Uint8Array>();
	const trashedPaths: string[] = [];
	const makeFile = (path: string) => {
		const name = path.split("/").at(-1) ?? path;
		const extensionIndex = name.lastIndexOf(".");
		const file = Object.assign(new TFile(), {
			path,
			name,
			basename: extensionIndex === -1 ? name : name.slice(0, extensionIndex),
			extension: extensionIndex === -1 ? "" : name.slice(extensionIndex + 1),
			stat: { ctime: 1, mtime: 1, size: 1 },
		});
		files.set(path, file);
		return file;
	};
	const app = {
		fileManager: {
			trashFile: async (file: InstanceType<typeof TFile>) => {
				trashedPaths.push(file.path);
				files.delete(file.path);
				text.delete(file.path);
				binary.delete(file.path);
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
		vault: {
			adapter: {
				stat: async (path: string) => folders.has(path)
					? { type: "folder" }
					: files.has(path) ? { type: "file" } : null,
			},
			getAbstractFileByPath: (path: string) => files.get(path) ?? folders.get(path) ?? null,
			getMarkdownFiles: () => [...files.values()].filter((file) => file.extension === "md"),
			cachedRead: async (file: InstanceType<typeof TFile>) => text.get(file.path) ?? "",
			readBinary: async (file: InstanceType<typeof TFile>) => copyArrayBuffer(binary.get(file.path) ?? new Uint8Array()),
			createFolder: async (path: string) => {
				const folder = Object.assign(new TFolder(), { path, name: path.split("/").at(-1) ?? path, children: [] });
				folders.set(path, folder);
			},
			createBinary: async (path: string, data: ArrayBuffer) => {
				const file = makeFile(path);
				binary.set(path, new Uint8Array(data));
				return file;
			},
		},
	};
	return {
		service: new ManagedPictureService(app as never),
		trashedPaths,
		addFile: (path: string, content: string) => {
			const file = makeFile(path);
			if (file.extension === "md") text.set(path, content);
			else binary.set(path, bytes(content));
		},
		hasFile: (path: string) => files.has(path),
	};
}

/** Encodes test fixture text as bytes. */
function bytes(value: string): Uint8Array {
	return new TextEncoder().encode(value);
}

/** Copies bytes into a standalone ArrayBuffer for strict TypeScript compatibility. */
function copyArrayBuffer(value: Uint8Array): ArrayBuffer {
	const copy = new Uint8Array(value.byteLength);
	copy.set(value);
	return copy.buffer;
}
