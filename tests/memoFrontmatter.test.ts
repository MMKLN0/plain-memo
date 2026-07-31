import test from "node:test";
import assert from "node:assert/strict";

import {
	getMemoCollapseLineWeight,
	getMemoVisibleContent,
	restoreMemoFrontmatter,
	splitLeadingMemoFrontmatter,
} from "../src/utils/memoFrontmatter";

const legacyMemo = "---\ncreated: 2025-08-05T08:55:37\n---\nfirst line\n\nsecond line";

test("splits only a complete leading YAML frontmatter block", () => {
	assert.deepEqual(splitLeadingMemoFrontmatter(legacyMemo), {
		frontmatter: "---\ncreated: 2025-08-05T08:55:37\n---\n",
		body: "first line\n\nsecond line",
	});
	assert.equal(getMemoVisibleContent("---\nnot closed\nbody"), "---\nnot closed\nbody");
});

test("restores existing frontmatter unchanged after editing the body", () => {
	assert.equal(
		restoreMemoFrontmatter(legacyMemo, "updated body"),
		"---\ncreated: 2025-08-05T08:55:37\n---\nupdated body",
	);
	assert.equal(restoreMemoFrontmatter("plain memo", "updated body"), "updated body");
});

test("counts visible text as one line and each blank run as 0.33 lines", () => {
	assert.equal(getMemoCollapseLineWeight(legacyMemo), 2.33);
	assert.equal(getMemoCollapseLineWeight("one\n\n\ntwo"), 2.33);
	assert.equal(getMemoCollapseLineWeight("one\n\ntwo\n\nthree"), 3.66);
});
