import { Notice, Platform, Plugin, TFile } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";

import {
	KNOMO_VIEW_TYPE,
	PLAIN_MEMO_DATA_FOLDER,
	PLAIN_MEMO_FOLDER,
	PLAIN_MEMO_PICTURE_FOLDER,
	SHARED_SETTINGS_PATH,
} from "./constants";
import { KNOMO_LOGO_ICON, registerKnomoIcons } from "./icons";
import { t } from "./i18n";
import { AttachmentService } from "./services/AttachmentService";
import { FileMemoOrchestrator } from "./services/FileMemoOrchestrator";
import { ManagedPictureService } from "./services/ManagedPictureService";
import { PluginDataStore } from "./services/PluginDataStore";
import { PinnedMemoService } from "./services/PinnedMemoService";
import { RandomReunionService } from "./services/RandomReunionService";
import { ReferenceService } from "./services/ReferenceService";
import { SettingsService } from "./services/SettingsService";
import { ShuffleDayService } from "./services/ShuffleDayService";
import { ViewRefreshScheduler } from "./services/ViewRefreshScheduler";
import { VaultJsonStore } from "./services/VaultJsonStore";
import type { MemoMutation } from "./types/memo";
import { KnomoSettingTab } from "./ui/KnomoSettingTab";
import { KnomoView } from "./ui/KnomoView";
import { MobileNavbarCompactController } from "./ui/MobileNavbarCompactController";

const OPEN_VIEWS_REFRESH_DEBOUNCE_MS = 150;
const DESKTOP_SHARED_STATE_POLL_MS = 2_000;
const MOBILE_SHARED_STATE_POLL_MS = 1_000;
const TRASH_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1_000;

export function getStartupDailyScanDays(isMobile: boolean): number { return isMobile ? 7 : 30; }

/** Keeps mobile state polling alive when Android reports a stale visibility state. */
export function shouldPollSharedState(isMobile: boolean, visibilityState: string, openViewCount: number): boolean {
	return openViewCount > 0 && (isMobile || visibilityState === "visible");
}

/** PlainMemo interface backed by standalone Markdown memo files. */
export default class KnomoPlugin extends Plugin {
	settingsService!: SettingsService;
	syncOrchestrator!: FileMemoOrchestrator;
	pinnedMemoService!: PinnedMemoService;
	private viewRefreshScheduler: ViewRefreshScheduler | null = null;
	private trashCleanupPromise: Promise<void> | null = null;
	private lastTrashCleanupAt = 0;

	async onload(): Promise<void> {
		registerKnomoIcons();
		const dataStore = new PluginDataStore(this);
		const vaultDataStore = new VaultJsonStore(this.app);
		try {
			await vaultDataStore.ensureFolder(PLAIN_MEMO_FOLDER);
			await vaultDataStore.ensureFolder(PLAIN_MEMO_DATA_FOLDER);
			await vaultDataStore.ensureFolder(PLAIN_MEMO_PICTURE_FOLDER);
		} catch (error) {
			new Notice(`PlainMemo could not prepare its Vault folders: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
		this.pinnedMemoService = new PinnedMemoService(vaultDataStore, dataStore);
		this.settingsService = new SettingsService(vaultDataStore, dataStore);
		try {
			await this.settingsService.loadSettings();
		} catch {
			// Keep the plugin available with in-memory defaults when persisted settings cannot be read.
		}
		await this.pinnedMemoService.load();
		const managedPictures = new ManagedPictureService(this.app);
		this.syncOrchestrator = new FileMemoOrchestrator(this.app, () => this.settingsService.getSettings(), managedPictures);
		const attachmentService = new AttachmentService(this.app, managedPictures);
		const referenceService = new ReferenceService(this.app);
		this.viewRefreshScheduler = new ViewRefreshScheduler(
			() => this.app.workspace.containerEl.win,
			() => this.refreshOpenViews(),
			OPEN_VIEWS_REFRESH_DEBOUNCE_MS,
		);

		this.registerView(KNOMO_VIEW_TYPE, (leaf: WorkspaceLeaf) => new KnomoView(
			leaf, this.settingsService, this.syncOrchestrator, referenceService,
			new RandomReunionService(vaultDataStore), new ShuffleDayService(vaultDataStore), attachmentService, this.pinnedMemoService,
			(mutation, source) => this.broadcastMemoMutation(mutation, source),
			() => this.refreshOpenViews(), () => this.manualRefresh(),
		));
		this.addSettingTab(new KnomoSettingTab(
			this.app,
			this,
			this.settingsService,
			this.syncOrchestrator,
			this.pinnedMemoService,
			() => this.refreshOpenViews(true),
		));
		this.registerMemoFileEvents();
		this.registerAttachmentEvents();
		this.registerSharedStateRefresh();
		this.registerTrashCleanup();
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
		this.registerEvent(this.app.vault.on("delete", (file) => { this.handleMemoFileChange(file.path, true); }));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			if (!this.syncOrchestrator.isRelevantVaultPath(file.path) || file.path.includes("/_knomo-trash/")) {
				void this.pinnedMemoService.removePath(oldPath);
			} else {
				void this.pinnedMemoService.replacePath(oldPath, file.path);
			}
			this.syncOrchestrator.invalidatePath(oldPath);
			if (this.syncOrchestrator.isRelevantVaultPath(oldPath) || this.syncOrchestrator.isRelevantVaultPath(file.path)) {
				this.syncOrchestrator.invalidatePath(file.path);
				void this.queueRefreshOpenViews();
			}
		}));
	}

	private handleMemoFileChange(path: string, removePinned = false): void {
		if (removePinned) void this.pinnedMemoService.removePath(path);
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
		await this.reloadSharedStateFromStorage();
		this.syncOrchestrator.invalidateAll();
		await this.refreshOpenViews(true);
	}
	private registerSharedStateRefresh(): void {
		const refresh = (): void => {
			void this.reloadSharedStateFromStorage();
			void this.runTrashCleanup();
		};
		this.registerDomEvent(this.app.workspace.containerEl.win, "focus", refresh);
		this.registerDomEvent(this.app.workspace.containerEl.doc, "visibilitychange", () => {
			if (this.app.workspace.containerEl.doc.visibilityState === "visible") refresh();
		});
		this.registerInterval(this.app.workspace.containerEl.win.setInterval(() => {
			if (shouldPollSharedState(
				Platform.isMobile,
				this.app.workspace.containerEl.doc.visibilityState,
				this.app.workspace.getLeavesOfType(KNOMO_VIEW_TYPE).length,
			)) refresh();
		}, Platform.isMobile ? MOBILE_SHARED_STATE_POLL_MS : DESKTOP_SHARED_STATE_POLL_MS));
		const refreshSharedFile = (path: string): void => {
			if (path === SHARED_SETTINGS_PATH || this.pinnedMemoService.isStatePath(path)) refresh();
		};
		this.registerEvent(this.app.vault.on("create", (file) => { refreshSharedFile(file.path); }));
		this.registerEvent(this.app.vault.on("modify", (file) => { refreshSharedFile(file.path); }));
		this.registerEvent(this.app.vault.on("delete", (file) => { refreshSharedFile(file.path); }));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			refreshSharedFile(oldPath);
			refreshSharedFile(file.path);
		}));
	}

	/** Runs trash cleanup at startup and once per day while Obsidian remains open. */
	private registerTrashCleanup(): void {
		void this.runTrashCleanup(true);
		this.registerInterval(this.app.workspace.containerEl.win.setInterval(() => {
			void this.runTrashCleanup();
		}, TRASH_CLEANUP_INTERVAL_MS));
	}

	/** Coalesces cleanup calls so filesystem work never overlaps. */
	private async runTrashCleanup(force = false): Promise<void> {
		const now = Date.now();
		if (!force && now - this.lastTrashCleanupAt < TRASH_CLEANUP_INTERVAL_MS) return;
		if (this.trashCleanupPromise !== null) {
			await this.trashCleanupPromise;
			if (!force) return;
		}
		this.lastTrashCleanupAt = Date.now();
		const cleanup = this.syncOrchestrator.purgeExpiredDeletedMemos().then((result) => {
			if (result.failed.length > 0) {
				console.error(`PlainMemo failed to purge ${result.failed.length} expired trash entries`, result.failed);
			}
		}).catch((error) => {
			console.error("PlainMemo automatic trash cleanup failed", error);
		});
		this.trashCleanupPromise = cleanup;
		try {
			await cleanup;
		} finally {
			if (this.trashCleanupPromise === cleanup) this.trashCleanupPromise = null;
		}
	}

	private async reloadSharedStateFromStorage(): Promise<boolean> {
		try {
			const [settingsChanged, pinnedChanged] = await Promise.all([
				this.settingsService.reloadIfChanged(),
				this.pinnedMemoService.reloadIfChanged(),
			]);
			if (settingsChanged) {
				void this.runTrashCleanup(true);
				this.syncOrchestrator.invalidateAll();
				await this.refreshOpenViews(true);
				return true;
			}
			if (!pinnedChanged) return false;
			for (const leaf of this.app.workspace.getLeavesOfType(KNOMO_VIEW_TYPE)) {
				if (leaf.view instanceof KnomoView) leaf.view.refreshPinnedMemoPresentation();
			}
			return true;
		} catch (error) {
			console.error("PlainMemo failed to reload synchronized state", error);
			return false;
		}
	}
	private broadcastMemoMutation(mutation: MemoMutation, source: KnomoView): void {
		for (const leaf of this.app.workspace.getLeavesOfType(KNOMO_VIEW_TYPE)) if (leaf.view instanceof KnomoView && leaf.view !== source) leaf.view.applyMemoMutation(mutation);
	}
	private broadcastAttachmentChanges(paths: readonly string[]): void {
		for (const leaf of this.app.workspace.getLeavesOfType(KNOMO_VIEW_TYPE)) if (leaf.view instanceof KnomoView) leaf.view.handleAttachmentFilesChanged(paths);
	}
}

function isSupportedImagePath(path: string): boolean { return /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(path); }
