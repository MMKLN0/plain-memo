import test from "node:test";
import assert from "node:assert/strict";

import {
	getDesktopFloatingCollapseRightOffset,
	shouldFloatCollapseControl,
} from "../src/ui/FloatingCollapseControl";

test("keeps a desktop collapse control floating when the card bottom overflows after a resize", () => {
	assert.equal(shouldFloatCollapseControl({
		cardTop: 120,
		cardBottom: 780,
		buttonBottom: 560,
		flowTop: 80,
		viewportBottom: 620,
		floatingBoundary: 620,
		isMobile: false,
	}), true);
});

test("retains the mobile button-boundary rule", () => {
	assert.equal(shouldFloatCollapseControl({
		cardTop: 120,
		cardBottom: 780,
		buttonBottom: 560,
		flowTop: 80,
		viewportBottom: 620,
		floatingBoundary: 540,
		isMobile: true,
	}), true);
	assert.equal(shouldFloatCollapseControl({
		cardTop: 120,
		cardBottom: 780,
		buttonBottom: 520,
		flowTop: 80,
		viewportBottom: 620,
		floatingBoundary: 540,
		isMobile: true,
	}), false);
});

test("anchors a desktop collapse control to the card when a right sidebar narrows the leaf", () => {
	const leafRight = 1564;
	const cardRight = 1454;

	assert.equal(getDesktopFloatingCollapseRightOffset(leafRight, cardRight, cardRight), 118);
});
