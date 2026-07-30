import type { MemoImageRef, MemoLinkRef } from "../types/memo";
import { parseMemoImages, parseMemoLinks, parseMemoTags } from "../utils/markdown";

export interface MemoMetadata {
	tags: string[];
	links: MemoLinkRef[];
	images: MemoImageRef[];
}

/** Extracts card metadata directly from a standalone Markdown file body. */
export class MarkdownBlockService {
	parseMemoMetadata(content: string): MemoMetadata {
		return {
			tags: parseMemoTags(content),
			links: parseMemoLinks(content),
			images: parseMemoImages(content),
		};
	}
}
