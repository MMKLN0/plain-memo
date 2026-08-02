import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTagPathInput, renameTagBranchInContent } from "../src/utils/tagRename";

test("renames a selected tag branch without changing its siblings", () => {
	const content = "#Area/生活/记录 #Area/生活/日记\n#Area/生活/记录/工作";
	assert.equal(
		renameTagBranchInContent(content, "Area/生活/记录", "Area/日常/记录"),
		"#Area/日常/记录 #Area/生活/日记\n#Area/日常/记录/工作",
	);
});

test("renames a parent tag together with every descendant", () => {
	const content = "#Area/生活/记录 #Area/生活/日记\n#Area/工作";
	assert.equal(
		renameTagBranchInContent(content, "Area/生活", "Area/日常"),
		"#Area/日常/记录 #Area/日常/日记\n#Area/工作",
	);
});

test("tag path input accepts an optional hash and rejects malformed paths", () => {
	assert.equal(normalizeTagPathInput(" #Area/日常/记录 "), "Area/日常/记录");
	assert.equal(normalizeTagPathInput("Area//记录"), null);
	assert.equal(normalizeTagPathInput("Area/生活 记录"), null);
});
