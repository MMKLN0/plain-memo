import test from "node:test";
import assert from "node:assert/strict";

import { ensureObsidianStub } from "./helpers/obsidianStub";

test("uses a smaller startup scan window on mobile instead of skipping recovery", async () => {
	await ensureObsidianStub();
	const { getStartupDailyScanDays } = await import("../src/main");

	assert.equal(getStartupDailyScanDays(true), 7);
	assert.equal(getStartupDailyScanDays(false), 30);
});

test("keeps shared-state polling active on mobile despite stale visibility state", async () => {
	await ensureObsidianStub();
	const { shouldPollSharedState } = await import("../src/main");

	assert.equal(shouldPollSharedState(true, "hidden", 1), true);
	assert.equal(shouldPollSharedState(false, "hidden", 1), false);
	assert.equal(shouldPollSharedState(false, "visible", 1), true);
	assert.equal(shouldPollSharedState(true, "hidden", 0), false);
});
