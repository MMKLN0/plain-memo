import type { App, TFile } from "obsidian";

import { renameTagBranchInContent } from "../utils/tagRename";

export interface TagRenameChange {
	file: TFile;
	content: string;
}

export interface TagRenamePlan {
	changes: TagRenameChange[];
}

/** Plans all writes before modifying any memo file, so the affected scope is known first. */
export class TagRenameService {
	constructor(
		private readonly app: App,
		private readonly getMemoFiles: () => TFile[],
	) {}

	async prepare(sourceTag: string, targetTag: string): Promise<TagRenamePlan> {
		const changes: TagRenameChange[] = [];
		for (const file of this.getMemoFiles()) {
			const existing = await this.app.vault.cachedRead(file);
			const content = renameTagBranchInContent(existing, sourceTag, targetTag);
			if (content !== existing) {
				changes.push({ file, content });
			}
		}
		return { changes };
	}

	async apply(plan: TagRenamePlan): Promise<void> {
		for (const change of plan.changes) {
			await this.app.vault.modify(change.file, change.content);
		}
	}
}
