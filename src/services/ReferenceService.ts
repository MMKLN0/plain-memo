import { TFile } from "obsidian";
import type { App } from "obsidian";

import type { MemoRecord } from "../types/memo";
import type { ReferenceMode } from "../types/settings";
import { MarkdownBlockService } from "./MarkdownBlockService";

type EnsureReferenceBlockId = (memo: MemoRecord) => Promise<string>;

// 职责：读取或生成 Obsidian blockId，并生成块引用文本。
export class ReferenceService {
	constructor(
		private readonly app: App,
		// Kept as an optional argument for compatibility with older callers.
		private readonly _legacyBlockService?: MarkdownBlockService,
		private readonly _legacyEnsureBlockId?: EnsureReferenceBlockId,
	) {}

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
		const blockId = this._legacyEnsureBlockId === undefined
			? null
			: await this.getLegacyBlockId(file, memo);
		const link = this.app.fileManager.generateMarkdownLink(
			file,
			activeSourcePath,
			blockId === null ? undefined : `#^${blockId}`,
		);
		return mode === "embed" ? `!${link}` : link;
	}

	private async getLegacyBlockId(file: TFile, memo: MemoRecord): Promise<string> {
		const currentContent = await this.app.vault.cachedRead(file);
		const location = (this._legacyBlockService ?? new MarkdownBlockService()).findMemoBlock(currentContent, {
			lineNumberHint: memo.dailyRef.lineNumberHint,
			lastKnownBlock: memo.dailyRef.lastKnownBlock,
			lastKnownHash: memo.dailyRef.lastKnownHash,
			contentHash: memo.contentHash,
			allowLineHintTimeMatch: true,
		}, "daily_block_missing");
		return location.parsedBlock?.blockId ?? await this._legacyEnsureBlockId!(memo);
	}
}
