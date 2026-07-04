import { App, Modal, Setting } from 'obsidian';
import type { OutlinePastePreflight } from '../services/OutlinePasteParser';
import { t } from '../i18n';

export function confirmLargeOutlinePaste(
	app: App,
	preflight: OutlinePastePreflight,
	signal: AbortSignal,
): Promise<boolean> {
	return new Promise((resolve) => {
		if (signal.aborted) {
			resolve(false);
			return;
		}

		const modal = new LargeOutlinePasteConfirmModal(app, preflight, resolve);
		const abort = () => modal.cancel();
		signal.addEventListener('abort', abort, { once: true });
		modal.onSettled = () => signal.removeEventListener('abort', abort);
		modal.open();
	});
}

class LargeOutlinePasteConfirmModal extends Modal {
	private settled = false;
	onSettled: (() => void) | null = null;

	constructor(
		app: App,
		private readonly preflight: OutlinePastePreflight,
		private readonly resolveResult: (process: boolean) => void,
	) {
		super(app);
	}

	onOpen() {
		this.setTitle(t('outline.large.title'));
		this.contentEl.createEl('p', {
			text: t('outline.large.desc'),
		});

		const details = this.preflight.preferredSource === 'html'
			? t('outline.large.htmlDetails', {
				bytes: formatBytes(this.preflight.htmlBytes),
				tags: this.preflight.htmlStructure.totalSupportedTagCount,
			})
			: t('outline.large.textDetails', {
				bytes: formatBytes(this.preflight.textBytes),
				lines: this.preflight.textLines,
			});
		this.contentEl.createEl('p', { text: details });
		if (this.preflight.message) {
			this.contentEl.createEl('p', { text: this.preflight.message });
		}

		new Setting(this.contentEl)
			.addButton((button) => {
				button
					.setButtonText(t('action.cancel'))
					.onClick(() => this.settle(false));
			})
			.addButton((button) => {
				button
					.setButtonText(t('action.process'))
					.setCta()
					.onClick(() => this.settle(true));
			});
	}

	onClose() {
		this.contentEl.empty();
		this.settle(false, false);
	}

	cancel() {
		this.settle(false);
	}

	private settle(process: boolean, close = true) {
		if (this.settled) {
			return;
		}

		this.settled = true;
		this.resolveResult(process);
		this.onSettled?.();
		if (close) {
			this.close();
		}
	}
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}

	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KiB`;
	}

	return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
