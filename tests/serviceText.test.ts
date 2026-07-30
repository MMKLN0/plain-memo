import test from "node:test";
import assert from "node:assert/strict";
import { ensureObsidianStub } from "./helpers/obsidianStub";

test("formats current service errors and memo terminology", async () => {
	await ensureObsidianStub();
	const { formatServiceError, formatSettingsText } = await import("../src/utils/serviceText");

	assert.equal(formatServiceError(new Error("Memo content cannot be empty.")), "memo content cannot be empty.");
	assert.equal(formatSettingsText("memoId and blockId"), "memo ID and block ID");
	assert.equal(formatServiceError(null, "fallback"), "fallback");
});
