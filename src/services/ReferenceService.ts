import { TFile } from "obsidian";
import type { App } from "obsidian";

import type { MemoRecord } from "../types/memo";
import type { ReferenceMode } from "../types/settings";

// 职责：读取或生成 Obsidian blockId，并生成块引用文本。
export class ReferenceService {
	constructor(private readonly app: App) {}

	async createReferenceText(
		memo: MemoRecord,
		mode: ReferenceMode,
		sourcePath?: string,
	): Promise<string> {
		const activeSourcePath = sourcePath ?? "";
		const file = this.app.vault.getAbstractFileByPath(memo.dailyRef.path);
		if (!(file instanceof TFile)) {
			throw new Error("Reference target file is missing.");
		}
		const link = this.app.fileManager.generateMarkdownLink(
			file,
			activeSourcePath,
		);
		return mode === "embed" ? `!${link}` : link;
	}
}
