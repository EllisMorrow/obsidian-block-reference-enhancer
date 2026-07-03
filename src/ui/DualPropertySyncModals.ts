import { App, Modal, Notice, Setting } from 'obsidian';
import type {
	DualPropertyBatchReport,
	DualPropertyBatchSummary,
	DualPropertyConflict,
	DualPropertyConflictChoice,
} from '../dual-property-sync/types';

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
		this.setTitle(isCleanup ? 'Return to Logseq-only page properties' : 'Sync page properties');
		this.contentEl.createEl('p', {
			text: isCleanup
				? 'Only files whose YAML is fully represented by Logseq page properties will be changed. Unsafe files will be skipped.'
				: 'Review the scan summary before changing files. Files changed after scanning will be skipped.',
		});
		this.contentEl.createEl('ul').append(
			createListItem(this.contentEl.ownerDocument, `Files scanned: ${this.summary.totalFiles}`),
			createListItem(this.contentEl.ownerDocument, `Files to change: ${this.summary.changeFiles}`),
			createListItem(this.contentEl.ownerDocument, `YAML repairs: ${this.summary.repairFiles}`),
			createListItem(this.contentEl.ownerDocument, `Conflicts: ${this.summary.conflictFiles}`),
			createListItem(this.contentEl.ownerDocument, `Skipped: ${this.summary.skippedFiles}`),
		);

		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.settle(false)))
			.addButton((button) => {
				button.setButtonText(isCleanup ? 'Remove safe YAML and disable sync' : 'Continue');
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
		this.setTitle('Resolve page property conflicts');
		this.contentEl.addClass('block-reference-dual-property-conflicts');
		this.contentEl.createEl('p', {
			text: 'Both property formats changed and their order cannot be determined safely. Skipping is the default.',
		});

		for (const conflict of this.conflicts) {
			this.choices[conflict.filePath] = 'skip';
			new Setting(this.contentEl)
				.setName(conflict.filePath)
				.setDesc(`Conflicting properties: ${conflict.ruleIds.join(', ')}`)
				.addDropdown((dropdown) => dropdown
					.addOption('skip', 'Skip')
					.addOption('yaml', 'Use Obsidian YAML')
					.addOption('logseq', 'Use Logseq properties')
					.setValue('skip')
					.onChange((value) => {
						this.choices[conflict.filePath] = value as DualPropertyConflictChoice;
					}));
		}

		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.settle(null)))
			.addButton((button) => button.setButtonText('Apply choices').setCta().onClick(() => this.settle({ ...this.choices })));
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
		this.setTitle(this.report.operation === 'cleanup' ? 'Logseq-only cleanup report' : 'Page property sync report');
		this.contentEl.createEl('p', {
			text: `Changed ${this.report.changed.length}; repaired ${this.report.repaired.length}; unchanged ${this.report.unchanged.length}; skipped ${this.report.skipped.length}; conflicts ${this.report.conflicts.length}.`,
		});
		appendReportSection(this.contentEl, 'Changed', this.report.changed);
		appendReportSection(this.contentEl, 'Repaired', this.report.repaired);
		appendReportSection(this.contentEl, 'Conflicts', this.report.conflicts);
		appendReportSection(this.contentEl, 'Skipped', this.report.skipped.map((item) => `${item.filePath}: ${item.reason}`));
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('Copy report').onClick(async () => {
				if (!navigator.clipboard?.writeText) {
					new Notice('Clipboard API unavailable on this platform.');
					return;
				}
				try {
					await navigator.clipboard.writeText(formatReport(this.report));
					new Notice('Page property report copied.');
				} catch {
					new Notice('Failed to copy the page property report.');
				}
			}))
			.addButton((button) => button.setButtonText('Close').setCta().onClick(() => this.close()));
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
		list.createEl('li', { text: `...and ${lines.length - 200} more.` });
	}
}

function formatReport(report: DualPropertyBatchReport): string {
	const sections: Array<[string, string[]]> = [
		['Changed', report.changed],
		['Repaired', report.repaired],
		['Unchanged', report.unchanged],
		['Conflicts', report.conflicts],
		['Skipped', report.skipped.map((item) => `${item.filePath}: ${item.reason}`)],
	];
	return sections
		.filter(([, lines]) => lines.length > 0)
		.map(([title, lines]) => `${title}\n${lines.map((line) => `- ${line}`).join('\n')}`)
		.join('\n\n');
}
