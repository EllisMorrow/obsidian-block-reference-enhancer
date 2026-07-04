import { App, Modal, Notice, Setting } from 'obsidian';
import type {
	DualPropertyBatchReport,
	DualPropertyBatchSummary,
	DualPropertyConflict,
	DualPropertyConflictChoice,
} from '../dual-property-sync/types';
import { t } from '../i18n';

export function confirmDualPropertyBatch(
	app: App,
	summary: DualPropertyBatchSummary,
	operation: 'sync' | 'cleanup',
): Promise<boolean> {
	return new Promise((resolve) => {
		new DualPropertyBatchConfirmModal(app, summary, operation, resolve).open();
	});
}

export function resolveDualPropertyConflicts(
	app: App,
	conflicts: DualPropertyConflict[],
): Promise<Record<string, DualPropertyConflictChoice> | null> {
	return new Promise((resolve) => {
		new DualPropertyConflictModal(app, conflicts, resolve).open();
	});
}

export function showDualPropertyBatchReport(app: App, report: DualPropertyBatchReport) {
	new DualPropertyBatchReportModal(app, report).open();
}

class DualPropertyBatchConfirmModal extends Modal {
	private settled = false;

	constructor(
		app: App,
		private readonly summary: DualPropertyBatchSummary,
		private readonly operation: 'sync' | 'cleanup',
		private readonly resolveResult: (confirmed: boolean) => void,
	) {
		super(app);
	}

	onOpen() {
		const isCleanup = this.operation === 'cleanup';
		this.setTitle(isCleanup ? t('sync.confirm.cleanupTitle') : t('sync.confirm.syncTitle'));
		this.contentEl.createEl('p', {
			text: isCleanup
				? t('sync.confirm.cleanupDesc')
				: t('sync.confirm.syncDesc'),
		});
		this.contentEl.createEl('ul').append(
			createListItem(this.contentEl.ownerDocument, t('sync.summary.scanned', { count: this.summary.totalFiles })),
			createListItem(this.contentEl.ownerDocument, t('sync.summary.changes', { count: this.summary.changeFiles })),
			createListItem(this.contentEl.ownerDocument, t('sync.summary.repairs', { count: this.summary.repairFiles })),
			createListItem(this.contentEl.ownerDocument, t('sync.summary.conflicts', { count: this.summary.conflictFiles })),
			createListItem(this.contentEl.ownerDocument, t('sync.summary.skipped', { count: this.summary.skippedFiles })),
		);

		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText(t('action.cancel')).onClick(() => this.settle(false)))
			.addButton((button) => {
				button.setButtonText(isCleanup ? t('action.removeYamlAndDisable') : t('action.continue'));
				if (isCleanup) button.setWarning();
				else button.setCta();
				button.onClick(() => this.settle(true));
			});
	}

	onClose() {
		this.contentEl.empty();
		this.settle(false, false);
	}

	private settle(result: boolean, close = true) {
		if (this.settled) return;
		this.settled = true;
		this.resolveResult(result);
		if (close) this.close();
	}
}

class DualPropertyConflictModal extends Modal {
	private settled = false;
	private readonly choices: Record<string, DualPropertyConflictChoice> = {};

	constructor(
		app: App,
		private readonly conflicts: DualPropertyConflict[],
		private readonly resolveResult: (choices: Record<string, DualPropertyConflictChoice> | null) => void,
	) {
		super(app);
	}

	onOpen() {
		this.setTitle(t('sync.conflicts.title'));
		this.contentEl.addClass('block-reference-dual-property-conflicts');
		this.contentEl.createEl('p', {
			text: t('sync.conflicts.desc'),
		});

		for (const conflict of this.conflicts) {
			this.choices[conflict.filePath] = 'skip';
			new Setting(this.contentEl)
				.setName(conflict.filePath)
				.setDesc(t('sync.conflicts.properties', { properties: conflict.ruleIds.join(', ') }))
				.addDropdown((dropdown) => dropdown
					.addOption('skip', t('sync.conflicts.skip'))
					.addOption('yaml', t('sync.conflicts.useYaml'))
					.addOption('logseq', t('sync.conflicts.useLogseq'))
					.setValue('skip')
					.onChange((value) => {
						this.choices[conflict.filePath] = value as DualPropertyConflictChoice;
					}));
		}

		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText(t('action.cancel')).onClick(() => this.settle(null)))
			.addButton((button) => button.setButtonText(t('action.applyChoices')).setCta().onClick(() => this.settle({ ...this.choices })));
	}

	onClose() {
		this.contentEl.empty();
		this.settle(null, false);
	}

	private settle(result: Record<string, DualPropertyConflictChoice> | null, close = true) {
		if (this.settled) return;
		this.settled = true;
		this.resolveResult(result);
		if (close) this.close();
	}
}

class DualPropertyBatchReportModal extends Modal {
	constructor(app: App, private readonly report: DualPropertyBatchReport) {
		super(app);
	}

	onOpen() {
		this.setTitle(this.report.operation === 'cleanup' ? t('sync.report.cleanupTitle') : t('sync.report.syncTitle'));
		this.contentEl.createEl('p', {
			text: t('sync.report.summary', {
				changed: this.report.changed.length,
				repaired: this.report.repaired.length,
				unchanged: this.report.unchanged.length,
				skipped: this.report.skipped.length,
				conflicts: this.report.conflicts.length,
			}),
		});
		appendReportSection(this.contentEl, t('sync.report.changed'), this.report.changed);
		appendReportSection(this.contentEl, t('sync.report.repaired'), this.report.repaired);
		appendReportSection(this.contentEl, t('sync.report.conflicts'), this.report.conflicts);
		appendReportSection(this.contentEl, t('sync.report.skipped'), this.report.skipped.map((item) => `${item.filePath}: ${item.reason}`));
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText(t('action.copyReport')).onClick(async () => {
				if (!navigator.clipboard?.writeText) {
					new Notice(t('notice.clipboardUnavailable'));
					return;
				}
				try {
					await navigator.clipboard.writeText(formatReport(this.report));
					new Notice(t('sync.report.copied'));
				} catch {
					new Notice(t('sync.report.copyFailed'));
				}
			}))
			.addButton((button) => button.setButtonText(t('action.close')).setCta().onClick(() => this.close()));
	}

	onClose() {
		this.contentEl.empty();
	}
}

function createListItem(doc: Document, text: string): HTMLLIElement {
	const item = doc.createElement('li');
	item.textContent = text;
	return item;
}

function appendReportSection(container: HTMLElement, title: string, lines: string[]) {
	if (lines.length === 0) return;
	new Setting(container).setName(title).setHeading();
	const list = container.createEl('ul');
	for (const line of lines.slice(0, 200)) {
		list.createEl('li', { text: line });
	}
	if (lines.length > 200) {
		list.createEl('li', { text: t('sync.report.more', { count: lines.length - 200 }) });
	}
}

function formatReport(report: DualPropertyBatchReport): string {
	const sections: Array<[string, string[]]> = [
		[t('sync.report.changed'), report.changed],
		[t('sync.report.repaired'), report.repaired],
		[t('sync.report.unchanged'), report.unchanged],
		[t('sync.report.conflicts'), report.conflicts],
		[t('sync.report.skipped'), report.skipped.map((item) => `${item.filePath}: ${item.reason}`)],
	];
	return sections
		.filter(([, lines]) => lines.length > 0)
		.map(([title, lines]) => `${title}\n${lines.map((line) => `- ${line}`).join('\n')}`)
		.join('\n\n');
}
