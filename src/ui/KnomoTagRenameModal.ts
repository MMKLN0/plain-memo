import { Modal, Platform } from "obsidian";
import type { App } from "obsidian";

import { t } from "../i18n";
import { normalizeTagPathInput } from "../utils/tagRename";

export function showKnomoTagRenameModal(app: App, sourceTag: string): Promise<string | null> {
	if (Platform.isMobile) {
		return new Promise<string | null>((resolve) => new MobileTagRenameOverlay(app, sourceTag, resolve).open());
	}
	return new Promise<string | null>((resolve) => new KnomoTagRenameModal(app, sourceTag, resolve).open());
}

class KnomoTagRenameModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private readonly sourceTag: string,
		private readonly resolveResult: (tag: string | null) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("knomo-tag-rename-modal");
		this.titleEl.setText(t("tags.renameTitle"));
		this.contentEl.empty();
		this.contentEl.createEl("p", { text: t("tags.renameDescription") });
		const input = this.contentEl.createEl("input", {
			cls: "knomo-tag-rename-input",
			attr: { type: "text", value: `#${this.sourceTag}`, "aria-label": t("tags.renameInput") },
		});
		const error = this.contentEl.createDiv({ cls: "knomo-tag-rename-error" });
		const actions = this.contentEl.createDiv({ cls: "modal-button-container" });
		const cancel = actions.createEl("button", { text: t("confirm.cancel"), attr: { type: "button" } });
		const confirm = actions.createEl("button", { cls: "mod-cta", text: t("tags.renameConfirm"), attr: { type: "button" } });
		const submit = () => {
			const target = normalizeTagPathInput(input.value);
			if (target === null) {
				error.setText(t("tags.renameInvalid"));
				input.focus();
				return;
			}
			this.finish(target);
		};
		cancel.addEventListener("click", () => this.finish(null));
		confirm.addEventListener("click", submit);
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				submit();
			}
		});
		this.containerEl.win.requestAnimationFrame(() => {
			try {
				input.focus({ preventScroll: true });
			} catch {
				input.focus();
			}
			input.select();
		});
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.resolved) {
			this.resolved = true;
			this.resolveResult(null);
		}
	}

	private finish(result: string | null): void {
		if (this.resolved) return;
		this.resolved = true;
		this.resolveResult(result);
		this.close();
	}
}

class MobileTagRenameOverlay {
	private root: HTMLElement | null = null;
	private viewport: VisualViewport | null = null;
	private updatePosition: (() => void) | null = null;
	private resolved = false;

	constructor(
		private readonly app: App,
		private readonly sourceTag: string,
		private readonly resolveResult: (tag: string | null) => void,
	) {}

	open(): void {
		const document = this.app.workspace.containerEl.ownerDocument;
		const window = document.defaultView;
		if (window === null) {
			this.finish(null);
			return;
		}
		const root = document.createElement("div");
		root.className = "knomo-tag-rename-overlay";
		root.setAttribute("role", "presentation");
		const panel = document.createElement("div");
		panel.className = "knomo-tag-rename-panel";
		panel.setAttribute("role", "dialog");
		panel.setAttribute("aria-modal", "true");
		panel.setAttribute("aria-label", t("tags.renameTitle"));
		root.appendChild(panel);
		const header = document.createElement("div");
		header.className = "knomo-tag-rename-header";
		panel.appendChild(header);
		const title = document.createElement("div");
		title.className = "knomo-tag-rename-title";
		title.textContent = t("tags.renameTitle");
		header.appendChild(title);
		const closeButton = document.createElement("button");
		closeButton.className = "knomo-tag-rename-close";
		closeButton.type = "button";
		closeButton.setAttribute("aria-label", t("confirm.cancel"));
		header.appendChild(closeButton);
		setCloseIcon(closeButton);
		const description = document.createElement("div");
		description.className = "knomo-tag-rename-description";
		description.textContent = t("tags.renameDescription");
		panel.appendChild(description);
		const input = document.createElement("input");
		input.className = "knomo-tag-rename-input";
		input.type = "text";
		input.value = `#${this.sourceTag}`;
		input.setAttribute("aria-label", t("tags.renameInput"));
		panel.appendChild(input);
		const error = document.createElement("div");
		error.className = "knomo-tag-rename-error";
		panel.appendChild(error);
		const actions = document.createElement("div");
		actions.className = "knomo-tag-rename-actions";
		panel.appendChild(actions);
		const cancel = document.createElement("button");
		cancel.type = "button";
		cancel.textContent = t("confirm.cancel");
		actions.appendChild(cancel);
		const confirm = document.createElement("button");
		confirm.type = "button";
		confirm.className = "mod-cta";
		confirm.textContent = t("tags.renameConfirm");
		actions.appendChild(confirm);
		const submit = () => {
			const target = normalizeTagPathInput(input.value);
			if (target === null) {
				error.textContent = t("tags.renameInvalid");
				input.focus();
				return;
			}
			this.finish(target);
		};
		this.root = root;
		document.body.appendChild(root);
		const updatePosition = () => {
			const viewport = window.visualViewport;
			const viewportTop = viewport?.offsetTop ?? 0;
			const viewportHeight = viewport?.height ?? window.innerHeight;
			const panelHeight = panel.getBoundingClientRect().height;
			const keyboardOpen = viewportHeight < window.innerHeight - 100;
			const top = keyboardOpen
				? viewportTop + viewportHeight - panelHeight - 12
				: viewportTop + Math.max(12, (viewportHeight - panelHeight) / 2 - 70);
			panel.setCssProps({ top: `${Math.round(top)}px` });
		};
		this.updatePosition = updatePosition;
		this.viewport = window.visualViewport;
		this.viewport?.addEventListener("resize", updatePosition);
		window.addEventListener("resize", updatePosition);
		updatePosition();
		root.addEventListener("click", (event) => {
			if (event.target === root) this.finish(null);
		});
		closeButton.addEventListener("click", () => this.finish(null));
		cancel.addEventListener("click", () => this.finish(null));
		confirm.addEventListener("click", submit);
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				submit();
			} else if (event.key === "Escape") {
				event.preventDefault();
				this.finish(null);
			}
		});
		window.requestAnimationFrame(() => {
			if (!input.isConnected) return;
			try {
				input.focus({ preventScroll: true });
			} catch {
				input.focus();
			}
			input.select();
		});
	}

	private finish(result: string | null): void {
		if (this.resolved) return;
		this.resolved = true;
		if (this.updatePosition !== null) {
			this.viewport?.removeEventListener("resize", this.updatePosition);
			this.app.workspace.containerEl.ownerDocument.defaultView?.removeEventListener("resize", this.updatePosition);
		}
		this.viewport = null;
		this.updatePosition = null;
		this.root?.remove();
		this.root = null;
		this.resolveResult(result);
	}
}

function setCloseIcon(button: HTMLElement): void {
	button.setText("×");
}
