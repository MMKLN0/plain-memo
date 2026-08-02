import { normalizeTagKey } from "./tags";

const TAG_REFERENCE_REGEX = /(^|[\s([{])#([^\s#\]]+)/g;

export function normalizeTagPathInput(value: string): string | null {
	const path = value.trim().replace(/^#/, "");
	if (path.length === 0 || path.includes("#") || /[\s\[\]]/.test(path)) {
		return null;
	}
	const segments = path.split("/");
	return segments.every((segment) => segment.trim().length > 0) ? path : null;
}

/** Replaces one full tag path and its descendants, without changing sibling branches. */
export function renameTagBranchInContent(content: string, sourceTag: string, targetTag: string): string {
	const sourceKey = normalizeTagKey(sourceTag);
	const target = normalizeTagPathInput(targetTag);
	if (sourceKey.length === 0 || target === null) {
		return content;
	}
	const sourceSegmentCount = sourceKey.split("/").length;
	TAG_REFERENCE_REGEX.lastIndex = 0;
	return content.replace(TAG_REFERENCE_REGEX, (match, prefix: string, tag: string) => {
		const tagKey = normalizeTagKey(tag);
		if (tagKey !== sourceKey && !tagKey.startsWith(`${sourceKey}/`)) {
			return match;
		}
		const suffix = tag.split("/").slice(sourceSegmentCount).join("/");
		return `${prefix}#${suffix.length > 0 ? `${target}/${suffix}` : target}`;
	});
}
