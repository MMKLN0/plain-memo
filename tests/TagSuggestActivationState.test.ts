import test from "node:test";
import assert from "node:assert/strict";

import { TagSuggestActivationState } from "../src/ui/TagSuggestActivationState";

test("does not activate suggestions for a complete tag loaded from an existing memo", () => {
	const state = new TagSuggestActivationState();
	assert.equal(state.isEnabled(), false);
	state.reset();
	assert.equal(state.isEnabled(), false);
});

test("activates when the user types a hash or continues editing a tag", () => {
	const state = new TagSuggestActivationState();
	state.handleBeforeInput({ value: "memo ", selectionStart: 5, selectionEnd: 5, inputType: "insertText", data: "#" });
	assert.equal(state.isEnabled(), true);

	state.reset();
	state.handleBeforeInput({ value: "memo #tag", selectionStart: 9, selectionEnd: 9, inputType: "insertText", data: "s" });
	assert.equal(state.isEnabled(), true);

	state.reset();
	state.handleBeforeInput({ value: "memo #", selectionStart: 6, selectionEnd: 6, inputType: "insertCompositionText", data: "b" });
	assert.equal(state.isEnabled(), true);
});

test("does not activate for Enter or a full pasted tag", () => {
	const state = new TagSuggestActivationState();
	state.enableExplicitly();
	state.handleBeforeInput({ value: "memo #tag", selectionStart: 9, selectionEnd: 9, inputType: "insertLineBreak", data: null });
	assert.equal(state.isEnabled(), false);

	state.handleBeforeInput({ value: "memo ", selectionStart: 5, selectionEnd: 5, inputType: "insertFromPaste", data: "#tag" });
	assert.equal(state.isEnabled(), false);
});

test("moving the cursor can reset an open suggestion session", () => {
	const state = new TagSuggestActivationState();
	state.enableExplicitly();
	assert.equal(state.isEnabled(), true);
	state.reset();
	assert.equal(state.isEnabled(), false);
});
