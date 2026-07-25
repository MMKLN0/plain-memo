import { TFile, normalizePath } from "obsidian";
import type { App } from "obsidian";

import { formatMemoFilenameTimestamp, isPlainMemoFileName } from "../utils/fileMemoName";

export interface MemoFilenameImportPlan {
	files: TFile[];
	skipped: number;
}

export interface MemoFilenameImportResult {
	renamed: number;
	skipped: number;
	failed: string[];
}

/** Adds the PlainMemo timestamp suffix without changing Markdown content. */
export class MemoFilenameImportService {
	constructor(private readonly app: App) {}

	plan(folder: string): MemoFilenameImportPlan {
		const prefix = `${normalizePath(folder)}/`;
		const files = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(prefix));
		return {
			files: files.filter((file) => !isPlainMemoFileName(file.name)),
			skipped: files.filter((file) => isPlainMemoFileName(file.name)).length,
		};
	}

	async importFolder(folder: string): Promise<MemoFilenameImportResult> {
		const plan = this.plan(folder);
		let renamed = 0;
		const failed: string[] = [];
		for (const file of plan.files) {
			try {
				const target = await this.allocateTargetPath(file, `${file.basename}_${formatMemoFilenameTimestamp(new Date(file.stat.ctime))}`);
				await this.app.fileManager.renameFile(file, target);
				renamed += 1;
			} catch (error) {
				failed.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		return { renamed, skipped: plan.skipped, failed };
	}

	private async allocateTargetPath(file: TFile, stem: string): Promise<string> {
		const parent = file.parent?.path ?? "";
		const base = normalizePath(parent ? `${parent}/${stem}.md` : `${stem}.md`);
		if (this.app.vault.getAbstractFileByPath(base) === null) return base;
		for (let number = 2; ; number += 1) {
			const candidate = normalizePath(parent ? `${parent}/${stem} (${number}).md` : `${stem} (${number}).md`);
			if (this.app.vault.getAbstractFileByPath(candidate) === null) return candidate;
		}
	}
}
