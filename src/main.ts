import { Platform, Plugin, TFile } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";

import { KNOMO_VIEW_TYPE } from "./constants";
import { KNOMO_LOGO_ICON, registerKnomoIcons } from "./icons";
import { t } from "./i18n";
import { AttachmentService } from "./services/AttachmentService";
import { FileMemoOrchestrator } from "./services/FileMemoOrchestrator";
import { MarkdownBlockService } from "./services/MarkdownBlockService";
import { ObsidianExcludeService } from "./services/ObsidianExcludeService";
import { PluginDataStore } from "./services/PluginDataStore";
import { RandomReunionService } from "./services/RandomReunionService";
import { ReferenceService } from "./services/ReferenceService";
import { SettingsService } from "./services/SettingsService";
import { ShuffleDayService } from "./services/ShuffleDayService";
import { ViewRefreshScheduler } from "./services/ViewRefreshScheduler";
import type { MemoMutation } from "./types/memo";
import { KnomoSettingTab } from "./ui/KnomoSettingTab";
import { KnomoView } from "./ui/KnomoView";
import { MobileNavbarCompactController } from "./ui/MobileNavbarCompactController";

const OPEN_VIEWS_REFRESH_DEBOUNCE_MS = 150;

export function getStartupDailyScanDays(isMobile: boolean): number { return isMobile ? 7 : 30; }

/** PlainMemo interface backed by standalone Markdown memo files. */
export default class KnomoPlugin extends Plugin {
	settingsService!: SettingsService;
	syncOrchestrator!: FileMemoOrchestrator;
	private viewRefreshScheduler: ViewRefreshScheduler | null = null;

	async onload(): Promise<void> {
		registerKnomoIcons();
		const dataStore = new PluginDataStore(this);
		this.settingsService = new SettingsService(this, undefined, dataStore);
		try {
			await this.settingsService.loadSettings();
		} catch {
			// Keep the plugin available with in-memory defaults when persisted settings cannot be read.
		}
		this.syncOrchestrator = new FileMemoOrchestrator(this.app, () => this.settingsService.getSettings());
		const markdown = new MarkdownBlockService();
		const attachmentService = new AttachmentService(this.app);
		const referenceService = new ReferenceService(this.app, markdown);
		this.viewRefreshScheduler = new ViewRefreshScheduler(
			() => this.app.workspace.containerEl.win,
			() => this.refreshOpenViews(),
			OPEN_VIEWS_REFRESH_DEBOUNCE_MS,
		);

		this.registerView(KNOMO_VIEW_TYPE, (leaf: WorkspaceLeaf) => new KnomoView(
			leaf, this.settingsService, this.syncOrchestrator, referenceService,
			new RandomReunionService(dataStore), new ShuffleDayService(dataStore), attachmentService,
			(mutation, source) => this.broadcastMemoMutation(mutation, source),
			() => this.refreshOpenViews(), () => this.manualRefresh(),
		));
		this.addSettingTab(new KnomoSettingTab(
			this.app,
			this,
			this.settingsService,
			this.syncOrchestrator,
			new ObsidianExcludeService(this.app),
			() => this.refreshOpenViews(true),
		));
		this.registerMemoFileEvents();
		this.registerAttachmentEvents();
		this.registerHoverLinkSource(KNOMO_VIEW_TYPE, { display: "PlainMemo", defaultMod: false });
		this.addRibbonIcon(KNOMO_LOGO_ICON, t("app.openKnomo"), () => { void this.activateView(); });
		this.addCommand({ id: "open-view", name: t("app.openKnomo"), callback: () => { void this.activateView(); } });
	}

	onunload(): void { this.viewRefreshScheduler?.clear(); MobileNavbarCompactController.cleanupDocument(this.app.workspace.containerEl.doc); }

	async activateView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(KNOMO_VIEW_TYPE)[0];
		if (existing !== undefined) {
			await this.app.workspace.revealLeaf(existing);
			this.app.workspace.setActiveLeaf(existing, { focus: true });
			this.requestMobileNavbarSync(existing);
			return;
		}
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({ type: KNOMO_VIEW_TYPE, active: true });
		await this.app.workspace.revealLeaf(leaf);
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
		this.requestMobileNavbarSync(leaf);
	}

	private requestMobileNavbarSync(leaf: WorkspaceLeaf): void {
		if (Platform.isMobile && leaf.view instanceof KnomoView) leaf.view.requestMobileNavbarSync();
	}

	private registerMemoFileEvents(): void {
		this.registerEvent(this.app.vault.on("create", (file) => { this.handleMemoFileChange(file.path); }));
		this.registerEvent(this.app.vault.on("modify", (file) => { this.handleMemoFileChange(file.path); }));
		this.registerEvent(this.app.vault.on("delete", (file) => { this.handleMemoFileChange(file.path); }));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			this.syncOrchestrator.invalidatePath(oldPath);
			if (this.syncOrchestrator.isRelevantVaultPath(oldPath) || this.syncOrchestrator.isRelevantVaultPath(file.path)) {
				this.syncOrchestrator.invalidatePath(file.path);
				void this.queueRefreshOpenViews();
			}
		}));
	}

	private handleMemoFileChange(path: string): void {
		if (!this.syncOrchestrator.isRelevantVaultPath(path)) return;
		this.syncOrchestrator.invalidatePath(path);
		void this.queueRefreshOpenViews();
	}

	private registerAttachmentEvents(): void {
		const notify = (file: unknown) => { if (file instanceof TFile && isSupportedImagePath(file.path)) this.broadcastAttachmentChanges([file.path]); };
		this.registerEvent(this.app.vault.on("create", notify));
		this.registerEvent(this.app.vault.on("modify", notify));
		this.registerEvent(this.app.vault.on("delete", notify));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			const paths = [
				isSupportedImagePath(oldPath) ? oldPath : null,
				file instanceof TFile && isSupportedImagePath(file.path) ? file.path : null,
			].filter((path): path is string => path !== null);
			if (paths.length > 0) this.broadcastAttachmentChanges(paths);
		}));
	}

	private async queueRefreshOpenViews(): Promise<void> { await this.viewRefreshScheduler?.queue(); }
	private async refreshOpenViews(forceRebuild = false): Promise<void> {
		await Promise.all(this.app.workspace.getLeavesOfType(KNOMO_VIEW_TYPE).map(async (leaf) => {
			if (leaf.view instanceof KnomoView) await leaf.view.refresh(forceRebuild);
		}));
	}
	private async manualRefresh() {
		this.syncOrchestrator.invalidateAll();
		const result = await this.syncOrchestrator.scanRecentDailyMemos(0);
		await this.refreshOpenViews(true);
		return result;
	}
	private broadcastMemoMutation(mutation: MemoMutation, source: KnomoView): void {
		for (const leaf of this.app.workspace.getLeavesOfType(KNOMO_VIEW_TYPE)) if (leaf.view instanceof KnomoView && leaf.view !== source) leaf.view.applyMemoMutation(mutation);
	}
	private broadcastAttachmentChanges(paths: readonly string[]): void {
		for (const leaf of this.app.workspace.getLeavesOfType(KNOMO_VIEW_TYPE)) if (leaf.view instanceof KnomoView) leaf.view.handleAttachmentFilesChanged(paths);
	}
}

function isSupportedImagePath(path: string): boolean { return /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(path); }
