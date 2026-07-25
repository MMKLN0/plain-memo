import { getTagQueryAtCursor } from "../utils/composerInput";

export interface TagSuggestBeforeInput {
	value: string;
	selectionStart: number;
	selectionEnd: number;
	inputType: string;
	data: string | null;
}

/** Prevents complete tags loaded from an existing memo from opening suggestions on focus. */
export class TagSuggestActivationState {
	private enabled = false;

	reset(): void {
		this.enabled = false;
	}

	enableExplicitly(): void {
		this.enabled = true;
	}

	handleBeforeInput(input: TagSuggestBeforeInput): void {
		if (!isTagEditingInputType(input.inputType)) {
			this.enabled = false;
			return;
		}
		const insertsHash = input.data?.includes("#") === true;
		const continuesCurrentTag = input.selectionStart === input.selectionEnd
			&& getTagQueryAtCursor(input.value, input.selectionStart) !== null;
		this.enabled = insertsHash || continuesCurrentTag;
	}

	isEnabled(): boolean {
		return this.enabled;
	}
}

function isTagEditingInputType(inputType: string): boolean {
	return inputType === "insertText"
		|| inputType === "insertCompositionText"
		|| inputType === "deleteContentBackward"
		|| inputType === "deleteContentForward";
}
