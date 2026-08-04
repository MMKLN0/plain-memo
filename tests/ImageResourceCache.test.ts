import test from "node:test";
import assert from "node:assert/strict";

import { ensureObsidianStub } from "./helpers/obsidianStub";

test("resolves a complete Vault image path while Obsidian metadata is still stale", async () => {
	const harness = await createHarness();
	const file = harness.addFile("PlainMemo/picture/photo.png", 42);

	const resolved = harness.cache.get("PlainMemo/Memo_2608041200.md", file.path, harness.app);

	assert.equal(resolved.missing, false);
	assert.equal(resolved.resourcePath, file.path);
	assert.match(resolved.url ?? "", /knomo-mtime=42/);
});

test("invalidates cached misses so metadata resolution can retry without restarting Obsidian", async () => {
	const harness = await createHarness();
	const sourcePath = "PlainMemo/Memo_2608041200.md";
	const rawPath = "photo.png";

	assert.equal(harness.cache.get(sourcePath, rawPath, harness.app).missing, true);
	harness.linkTarget = harness.addFile("PlainMemo/picture/photo.png", 43);
	assert.deepEqual(harness.cache.invalidateMissing(), [rawPath]);
	assert.equal(harness.cache.get(sourcePath, rawPath, harness.app).missing, false);
});

test("changes the resource URL after a synced attachment event retries a failed image", async () => {
	const harness = await createHarness();
	const file = harness.addFile("PlainMemo/picture/photo.png", 44);
	const sourcePath = "PlainMemo/Memo_2608041200.md";
	const first = harness.cache.get(sourcePath, file.path, harness.app);

	harness.cache.invalidateImagePaths([file.path]);
	const retried = harness.cache.get(sourcePath, file.path, harness.app);

	assert.notEqual(retried.url, first.url);
	assert.match(retried.url ?? "", /knomo-refresh=0-1/);
});

test("full refresh uses a new resource URL after an earlier path retry", async () => {
	const harness = await createHarness();
	const file = harness.addFile("PlainMemo/picture/photo.png", 45);
	const sourcePath = "PlainMemo/Memo_2608041200.md";

	harness.cache.invalidateImagePaths([file.path]);
	const pathRetry = harness.cache.get(sourcePath, file.path, harness.app);
	harness.cache.clear();
	const fullRetry = harness.cache.get(sourcePath, file.path, harness.app);

	assert.notEqual(fullRetry.url, pathRetry.url);
	assert.match(fullRetry.url ?? "", /knomo-refresh=1-0/);
});

/** Creates a minimal Vault and metadata cache for image resolution tests. */
async function createHarness() {
	await ensureObsidianStub();
	const { TFile } = await import("obsidian");
	const { ImageResourceCache } = await import("../src/ui/ImageResourceCache");
	const files = new Map<string, InstanceType<typeof TFile>>();
	const harness = {
		cache: new ImageResourceCache(),
		linkTarget: null as InstanceType<typeof TFile> | null,
		app: null as never,
		addFile: (path: string, mtime: number) => {
			const file = Object.assign(new TFile(), {
				path,
				name: path.split("/").at(-1) ?? path,
				stat: { ctime: mtime, mtime, size: 1 },
			});
			files.set(path, file);
			return file;
		},
	};
	harness.app = {
		metadataCache: {
			getFirstLinkpathDest: () => harness.linkTarget,
		},
		vault: {
			getAbstractFileByPath: (path: string) => files.get(path) ?? null,
			getResourcePath: (file: InstanceType<typeof TFile>) => `app://vault/${file.path}`,
		},
	} as never;
	return harness;
}
