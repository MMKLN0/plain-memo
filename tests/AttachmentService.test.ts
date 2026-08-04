import test from "node:test";
import assert from "node:assert/strict";

import { AttachmentService } from "../src/services/AttachmentService";

test("AttachmentService creates stable full-path image embeds in the managed picture folder", async () => {
	const createdAttachments: Array<{ path: string; data: string }> = [];
	const service = new AttachmentService({
	} as never, {
		createBinary: async (name: string, data: Uint8Array) => {
			const attachment = { path: `PlainMemo/picture/${name}` };
				createdAttachments.push({
					path: attachment.path,
					data: new TextDecoder().decode(data),
				});
			return attachment;
		},
	} as never);

	const links = await service.createImageEmbedLinks("Daily/2026-06-02.md", [
		createTestFile("first.png", "first-data"),
		createTestFile("second.jpg", "second-data"),
	]);

	assert.deepEqual(createdAttachments, [
		{ path: "PlainMemo/picture/first.png", data: "first-data" },
		{ path: "PlainMemo/picture/second.jpg", data: "second-data" },
	]);
	assert.deepEqual(links, [
		"![[PlainMemo/picture/first.png]]",
		"![[PlainMemo/picture/second.jpg]]",
	]);
});

test("AttachmentService trashes attachments created earlier in a failed batch", async () => {
	const trashedPaths: string[] = [];
	let createCount = 0;
	const service = new AttachmentService({
		fileManager: {
			trashFile: async (attachment: { path: string }) => {
				trashedPaths.push(attachment.path);
			},
		},
	} as never, {
		createBinary: async (name: string) => {
				createCount += 1;
				if (createCount === 2) {
					throw new Error("disk full");
				}
			return { path: `PlainMemo/picture/${name}` };
		},
	} as never);

	await assert.rejects(
		service.createImageEmbedLinks("Daily/2026-06-02.md", [
			createTestFile("first.png", "first-data"),
			createTestFile("second.png", "second-data"),
		]),
		/disk full/,
	);
	assert.deepEqual(trashedPaths, ["PlainMemo/picture/first.png"]);
});

test("AttachmentService continues rollback after one attachment cannot be trashed", async () => {
	const trashAttempts: string[] = [];
	let createCount = 0;
	const service = new AttachmentService({
		fileManager: {
			trashFile: async (attachment: { path: string }) => {
				trashAttempts.push(attachment.path);
				if (attachment.path.endsWith("second.png")) {
					throw new Error("trash unavailable");
				}
			},
		},
	} as never, {
		createBinary: async (name: string) => {
				createCount += 1;
				if (createCount === 3) {
					throw new Error("disk full");
				}
			return { path: `PlainMemo/picture/${name}` };
		},
	} as never);

	await assert.rejects(
		service.createImageEmbedLinks("Daily/2026-06-02.md", [
			createTestFile("first.png", "first-data"),
			createTestFile("second.png", "second-data"),
			createTestFile("third.png", "third-data"),
		]),
		(error: unknown) => {
			assert.equal(error instanceof Error, true);
			assert.match((error as Error).message, /disk full/);
			assert.match((error as Error).message, /PlainMemo\/picture\/second\.png/);
			return true;
		},
	);
	assert.deepEqual(trashAttempts, ["PlainMemo/picture/second.png", "PlainMemo/picture/first.png"]);
});

function createTestFile(name: string, content: string): File {
	return {
		name,
		arrayBuffer: async () => new TextEncoder().encode(content).buffer,
	} as File;
}
