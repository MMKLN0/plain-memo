import { TFile, normalizePath } from "obsidian";
import type { App } from "obsidian";

import { formatMemoFilenameTimestamp, toSafeMemoFileStem } from "../utils/fileMemoName";
import { ensureFolder } from "../utils/vault";
import { ManagedPictureService } from "./ManagedPictureService";

interface FlomoMemoDraft {
	content: string;
	createdAt: Date;
}

interface FlomoSource {
	html: string;
	attachments: Map<string, Uint8Array>;
}

export interface FlomoImportPreview {
	memoCount: number;
	attachmentCount: number;
	missingAttachmentCount: number;
}

export interface FlomoImportOptions {
	skipAudioAttachments?: boolean;
	skipImageAttachments?: boolean;
}

export interface FlomoImportResult extends FlomoImportPreview {
	created: number;
	skipped: number;
	failed: string[];
}

/** Imports the public Flomo HTML export without adding metadata to the memo files. */
export class FlomoImportService {
	constructor(
		private readonly app: App,
		private readonly managedPictures = new ManagedPictureService(app),
	) {}

	async preview(file: File, importOptions: FlomoImportOptions = {}): Promise<FlomoImportPreview> {
		const options = normalizeImportOptions(importOptions);
		const source = await readFlomoSource(file);
		const drafts = parseFlomoMemos(source.html, options);
		const assetPaths = collectFlomoAssetPaths(source.html).filter((path) => !shouldSkipAttachment(path, options));
		const available = assetPaths.filter((path) => source.attachments.has(path)).length;
		return { memoCount: drafts.length, attachmentCount: available, missingAttachmentCount: assetPaths.length - available };
	}

	async import(file: File, targetFolder: string, importOptions: FlomoImportOptions = {}): Promise<FlomoImportResult> {
		const options = normalizeImportOptions(importOptions);
		const source = await readFlomoSource(file);
		const drafts = parseFlomoMemos(source.html, options);
		const sourceAssetPaths = collectFlomoAssetPaths(source.html).filter((path) => !shouldSkipAttachment(path, options));
		const attachmentLinks = await copyFlomoAttachments(
			this.app,
			this.managedPictures,
			targetFolder,
			sourceAssetPaths,
			source.attachments,
		);
		let created = 0;
		let skipped = 0;
		const failed: string[] = [];
		for (const draft of drafts) {
			try {
				const content = replaceAssetTokens(draft.content, attachmentLinks);
				const basePath = await this.getMemoBasePath(targetFolder, content, draft.createdAt);
				if (await this.findMemoWithContent(basePath, content) !== null) {
					skipped += 1;
					continue;
				}
				const path = await this.allocatePathForBase(basePath);
				await this.app.vault.create(path, content);
				created += 1;
			} catch (error) {
				failed.push(error instanceof Error ? error.message : String(error));
			}
		}
		const attachmentCount = attachmentLinks.size;
		return {
			memoCount: drafts.length,
			attachmentCount,
			missingAttachmentCount: sourceAssetPaths.length - attachmentCount,
			created,
			skipped,
			failed,
		};
	}

	private async getMemoBasePath(folder: string, content: string, createdAt: Date): Promise<string> {
		await ensureFolder(this.app, folder);
		const firstLine = content.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "Flomo";
		const stem = `${toSafeMemoFileStem(firstLine, "Flomo")}_${formatMemoFilenameTimestamp(createdAt)}`;
		return normalizePath(`${folder}/${stem}.md`);
	}

	private async allocatePath(folder: string, fileName: string): Promise<string> {
		return this.allocatePathForBase(normalizePath(`${folder}/${fileName}`));
	}

	private async allocatePathForBase(base: string): Promise<string> {
		if (this.app.vault.getAbstractFileByPath(base) === null) return base;
		const extensionIndex = base.lastIndexOf(".");
		const stem = extensionIndex === -1 ? base : base.slice(0, extensionIndex);
		const extension = extensionIndex === -1 ? "" : base.slice(extensionIndex);
		for (let number = 2; ; number += 1) {
			const candidate = `${stem} (${number})${extension}`;
			const existing = this.app.vault.getAbstractFileByPath(candidate);
			if (existing === null) return candidate;
			if (existing instanceof TFile && extension === ".md") return candidate;
		}
	}

	private async findMemoWithContent(basePath: string, content: string): Promise<TFile | null> {
		const extensionIndex = basePath.lastIndexOf(".");
		const stem = extensionIndex === -1 ? basePath : basePath.slice(0, extensionIndex);
		const extension = extensionIndex === -1 ? "" : basePath.slice(extensionIndex);
		for (let number = 1; ; number += 1) {
			const path = number === 1 ? basePath : `${stem} (${number})${extension}`;
			const existing = this.app.vault.getAbstractFileByPath(path);
			if (existing === null) return null;
			if (existing instanceof TFile && (await this.app.vault.cachedRead(existing)).trim() === content) return existing;
		}
	}

}

/** Copies available Flomo attachments through PlainMemo's managed picture store. */
export async function copyFlomoAttachments(
	app: App,
	managedPictures: ManagedPictureService,
	targetFolder: string,
	sourcePaths: readonly string[],
	attachments: ReadonlyMap<string, Uint8Array>,
): Promise<Map<string, string>> {
	const links = new Map<string, string>();
	if (attachments.size === 0) return links;
	let audioFolderReady = false;
	const audioFolder = normalizePath(`${targetFolder}/flomo-attachments`);
	for (const sourcePath of sourcePaths) {
		const data = attachments.get(sourcePath);
		if (data === undefined || links.has(sourcePath)) continue;
		const name = sourcePath.split("/").pop() ?? "attachment";
		if (isFlomoAudioPath(sourcePath)) {
			if (!audioFolderReady) {
				await ensureFolder(app, audioFolder);
				audioFolderReady = true;
			}
			const path = await findOrAllocateFlomoAttachmentPath(app, audioFolder, name, data);
			if (!(app.vault.getAbstractFileByPath(path) instanceof TFile)) {
				await app.vault.createBinary(path, copyBytes(data));
			}
			links.set(sourcePath, `![[${path}]]`);
			continue;
		}
		const picture = await managedPictures.createBinary(name, data, true);
		links.set(sourcePath, `![[${picture.path}]]`);
	}
	return links;
}

/** Reuses identical Flomo audio or allocates a collision-safe path in the legacy attachment folder. */
async function findOrAllocateFlomoAttachmentPath(
	app: App,
	folder: string,
	fileName: string,
	data: Uint8Array,
): Promise<string> {
	const base = normalizePath(`${folder}/${fileName}`);
	const extensionIndex = base.lastIndexOf(".");
	const stem = extensionIndex === -1 ? base : base.slice(0, extensionIndex);
	const extension = extensionIndex === -1 ? "" : base.slice(extensionIndex);
	for (let number = 1; ; number += 1) {
		const path = number === 1 ? base : `${stem} (${number})${extension}`;
		const existing = app.vault.getAbstractFileByPath(path);
		if (existing === null) return path;
		if (existing instanceof TFile && bytesEqual(new Uint8Array(await app.vault.readBinary(existing)), data)) return path;
	}
}

/** Produces an exact ArrayBuffer for imported Flomo audio data. */
function copyBytes(data: Uint8Array): ArrayBuffer {
	const copy = new Uint8Array(data.byteLength);
	copy.set(data);
	return copy.buffer;
}

/** Compares imported Flomo attachment bytes for deduplication. */
function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
	if (left.byteLength !== right.byteLength) return false;
	for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false;
	return true;
}

async function readFlomoSource(file: File): Promise<FlomoSource> {
	if (file.name.toLowerCase().endsWith(".html")) return { html: await file.text(), attachments: new Map() };
	if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("Choose a Flomo HTML or ZIP export.");
	const entries = await readZipEntries(await file.arrayBuffer());
	const htmlEntry = [...entries.entries()].find(([path]) => path.toLowerCase().endsWith(".html"));
	if (htmlEntry === undefined) throw new Error("The ZIP does not contain a Flomo HTML export.");
	const root = htmlEntry[0].slice(0, htmlEntry[0].lastIndexOf("/") + 1);
	const attachments = new Map<string, Uint8Array>();
	for (const [path, data] of entries) {
		if (!path.startsWith(root) || path === htmlEntry[0]) continue;
		attachments.set(path.slice(root.length), data);
	}
	return { html: new TextDecoder().decode(htmlEntry[1]), attachments };
}

function parseFlomoMemos(html: string, options: Required<FlomoImportOptions>): FlomoMemoDraft[] {
	const document = new DOMParser().parseFromString(html, "text/html");
	return Array.from(document.querySelectorAll<HTMLElement>(".memo")).flatMap((memo) => {
		const time = memo.querySelector(".time")?.textContent?.trim() ?? "";
		const createdAt = parseFlomoDate(time);
		const content = memo.querySelector<HTMLElement>(".content");
		if (createdAt === null || content === null) return [];
		const attachments = memo.querySelector<HTMLElement>(".files");
		const markdown = `${htmlToMarkdown(content, options)}${attachments === null ? "" : htmlToMarkdown(attachments, options)}`.trim();
		return markdown.length > 0 ? [{ content: markdown, createdAt }] : [];
	});
}

function parseFlomoDate(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
	if (match === null) return null;
	const parts = match.slice(1).map(Number);
	const date = new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4]);
	return date.getFullYear() === parts[0] && date.getMonth() === parts[1] - 1 && date.getDate() === parts[2] ? date : null;
}

function htmlToMarkdown(root: HTMLElement, options: Required<FlomoImportOptions>): string {
	const render = (node: Node): string => {
		if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
		if (!(node instanceof HTMLElement)) return "";
		const children = Array.from(node.childNodes).map(render).join("");
		switch (node.tagName.toLowerCase()) {
			case "br": return "\n";
			case "p": return `${children.trim()}\n\n`;
			case "strong": case "b": return `**${children}**`;
			case "em": case "i": return `*${children}*`;
			case "del": case "s": return `~~${children}~~`;
			case "a": {
				const href = node.getAttribute("href")?.trim() ?? "";
				return href ? (children.trim() && children.trim() !== href ? `[${children.trim()}](${href})` : href) : children;
			}
			case "ul": return Array.from(node.children).map((item) => `- ${render(item).trim()}`).join("\n") + "\n\n";
			case "ol": return Array.from(node.children).map((item, index) => `${index + 1}. ${render(item).trim()}`).join("\n") + "\n\n";
			case "li": return children;
			case "blockquote": return children.trim().split("\n").map((line) => `> ${line}`).join("\n") + "\n\n";
			case "pre": return `\`\`\`\n${node.textContent ?? ""}\n\`\`\`\n\n`;
			case "img": case "audio": case "video": {
				const source = node.getAttribute("src") ?? "";
				const path = normalizeFlomoAssetPath(source);
				return path === null || shouldSkipAttachment(path, options) ? "" : assetToken(source);
			}
			default: return children;
		}
	};
	return render(root).replace(/\n{3,}/g, "\n\n");
}

function normalizeImportOptions(options: FlomoImportOptions): Required<FlomoImportOptions> {
	return {
		skipAudioAttachments: options.skipAudioAttachments !== false,
		skipImageAttachments: options.skipImageAttachments === true,
	};
}

function shouldSkipAttachment(path: string, options: Required<FlomoImportOptions>): boolean {
	return isFlomoAudioPath(path) ? options.skipAudioAttachments : options.skipImageAttachments;
}

function isFlomoAudioPath(path: string): boolean {
	return /\.m4a$/i.test(path);
}

function collectFlomoAssetPaths(html: string): string[] {
	const document = new DOMParser().parseFromString(html, "text/html");
	return [...new Set(Array.from(document.querySelectorAll<HTMLElement>(".memo .content img[src], .memo .files img[src], .memo .files audio[src], .memo .files video[src]"))
		.map((element) => normalizeFlomoAssetPath(element.getAttribute("src") ?? ""))
		.filter((path) => path !== null))] as string[];
}

function assetToken(source: string): string {
	const path = normalizeFlomoAssetPath(source);
	return path === null ? "" : `@@PLAINMEMO_FLOMO_ASSET:${path}@@`;
}

function replaceAssetTokens(content: string, links: ReadonlyMap<string, string>): string {
	return content.replace(/@@PLAINMEMO_FLOMO_ASSET:([^@]+)@@/g, (_match, rawPath: string) => links.get(rawPath) ?? rawPath);
}

function normalizeFlomoAssetPath(source: string): string | null {
	const trimmed = source.trim().replace(/\\/g, "/");
	if (!trimmed || /^(?:https?:|data:)/i.test(trimmed)) return null;
	return trimmed.replace(/^\.\//, "").replace(/^\/+/, "");
}

async function readZipEntries(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
	const bytes = new Uint8Array(buffer);
	const view = new DataView(buffer);
	let end = -1;
	for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
		if (view.getUint32(offset, true) === 0x06054b50) { end = offset; break; }
	}
	if (end === -1) throw new Error("Invalid ZIP file.");
	const count = view.getUint16(end + 10, true);
	let offset = view.getUint32(end + 16, true);
	const entries = new Map<string, Uint8Array>();
	for (let index = 0; index < count; index += 1) {
		if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("Invalid ZIP directory.");
		const method = view.getUint16(offset + 10, true);
		const compressedSize = view.getUint32(offset + 20, true);
		const nameLength = view.getUint16(offset + 28, true);
		const extraLength = view.getUint16(offset + 30, true);
		const commentLength = view.getUint16(offset + 32, true);
		const localOffset = view.getUint32(offset + 42, true);
		const path = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
		if (!path.endsWith("/")) entries.set(path, await readZipEntry(bytes, view, localOffset, compressedSize, method));
		offset += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
}

async function readZipEntry(bytes: Uint8Array, view: DataView, localOffset: number, compressedSize: number, method: number): Promise<Uint8Array> {
	if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("Invalid ZIP entry.");
	const nameLength = view.getUint16(localOffset + 26, true);
	const extraLength = view.getUint16(localOffset + 28, true);
	const data = bytes.slice(localOffset + 30 + nameLength + extraLength, localOffset + 30 + nameLength + extraLength + compressedSize);
	if (method === 0) return data;
	if (method !== 8 || typeof DecompressionStream === "undefined") throw new Error("This ZIP compression is not supported by the current Obsidian runtime.");
	const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}
