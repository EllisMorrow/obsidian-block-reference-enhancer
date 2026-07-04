import { App, Notice, TFile } from 'obsidian';
import {
	analyzeDualPropertyDocument,
	removeFrontmatter,
	repairBulletizedYaml,
} from '../dual-property-sync/document';
import {
	buildDualPropertySyncPlan,
	createDualPropertySnapshot,
	materializeDualPropertySyncPlan,
	observeDualPropertyChanges,
	resolveDualPropertySyncPlan,
	type DualPropertySyncPlan,
} from '../dual-property-sync/reconcile';
import { parseDualPropertyRules, stableHash, valuesEqual } from '../dual-property-sync/rules';
import {
	normalizePersistedDualPropertySyncState,
	type DualPropertyBatchReport,
	type DualPropertyCleanupRecoveryEntry,
	type DualPropertyConflictChoice,
	type PersistedDualPropertySyncState,
} from '../dual-property-sync/types';
import {
	confirmDualPropertyBatch,
	resolveDualPropertyConflicts,
	showDualPropertyBatchReport,
} from '../ui/DualPropertySyncModals';
import { t } from '../i18n';

const REPAIR_DEBOUNCE_MS = 750;
const REPAIR_WINDOW_MS = 10 * 60 * 1000;
const MAX_REPAIRS_PER_WINDOW = 3;
const STATE_SAVE_DEBOUNCE_MS = 500;
const BATCH_YIELD_EVERY = 20;

export interface DualPropertySyncSettings {
	enableDualPagePropertySync: boolean;
	dualPagePropertyWhitelist: string;
	dualPagePropertyFolders: string;
}

interface DualPropertySyncCallbacks {
	getSettings: () => DualPropertySyncSettings;
	saveState: (state: PersistedDualPropertySyncState) => Promise<void>;
	disableSync: () => Promise<void>;
}

interface CleanupCandidate {
	file: TFile;
	originalContent: string;
	finalContent: string;
	frontmatter: string;
	repaired: boolean;
}

export class DualPropertySyncService {
	private state: PersistedDualPropertySyncState;
	private readonly repairTimers = new Map<string, number>();
	private readonly ownWriteHashes = new Map<string, string>();
	private saveTimer: number | null = null;
	private batchRunning = false;

	constructor(
		private readonly app: App,
		persistedState: unknown,
		private readonly callbacks: DualPropertySyncCallbacks,
	) {
		this.state = normalizePersistedDualPropertySyncState(persistedState);
	}

	dispose() {
		for (const timer of this.repairTimers.values()) {
			window.clearTimeout(timer);
		}
		this.repairTimers.clear();
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
			void this.callbacks.saveState(this.state);
		}
	}

	async syncCurrentFile(file: TFile | null): Promise<void> {
		if (!file || file.extension !== 'md') {
			new Notice(t('sync.openMarkdown'));
			return;
		}
		const context = this.getRuleContext();
		if (!context) return;

		const content = await this.app.vault.read(file);
		let plan = buildDualPropertySyncPlan({
			filePath: file.path,
			content,
			rules: context.rules,
			rulesFingerprint: context.fingerprint,
			snapshot: this.state.snapshots[file.path],
			allowRepair: true,
		});
		if (plan.errors.length > 0) {
			new Notice(t('sync.skipped', { reason: plan.errors[0] }));
			return;
		}

		if (plan.conflictRuleIds.length > 0) {
			const choices = await resolveDualPropertyConflicts(this.app, [{
				filePath: file.path,
				ruleIds: plan.conflictRuleIds,
			}]);
			if (!choices) return;
			const choice = choices[file.path] ?? 'skip';
			if (choice === 'skip') {
				new Notice(t('sync.conflictSkipped'));
				return;
			}
			plan = resolveDualPropertySyncPlan(plan, context.rules, choice);
		}

		const result = await this.applySyncPlan(file, plan, context.rules, context.fingerprint);
		new Notice(result === 'changed' ? t('sync.done') : result === 'unchanged' ? t('sync.alreadyDone') : t('sync.fileChanged'));
	}

	async scanAndSyncSelectedFolders(): Promise<void> {
		if (this.batchRunning) {
			new Notice(t('sync.batchBusy'));
			return;
		}
		const context = this.getRuleContext();
		if (!context) return;
		const folders = parseFolderScope(this.callbacks.getSettings().dualPagePropertyFolders);
		if (folders.errors.length > 0) {
			new Notice(folders.errors[0]);
			return;
		}
		if (folders.paths.length === 0) {
			new Notice(t('sync.addFolder'));
			return;
		}

		this.batchRunning = true;
		let cancelled = false;
		const status = new CancelableBatchNotice(t('sync.scanning'), () => {
			cancelled = true;
		});
		try {
			const files = this.getScopedMarkdownFiles(folders.paths);
			const plans: Array<{ file: TFile; plan: DualPropertySyncPlan }> = [];
			const report = createReport('sync');
			for (let index = 0; index < files.length; index += 1) {
				if (cancelled) {
					new Notice(t('sync.batchCancelled'));
					return;
				}
				if (index % BATCH_YIELD_EVERY === 0) {
					status.setMessage(t('sync.scanningProgress', { current: index, total: files.length }));
					await yieldToMainThread();
				}
				const file = files[index];
				const content = await this.app.vault.read(file);
				const plan = buildDualPropertySyncPlan({
					filePath: file.path,
					content,
					rules: context.rules,
					rulesFingerprint: context.fingerprint,
					snapshot: this.state.snapshots[file.path],
					allowRepair: true,
				});
				if (plan.errors.length > 0) {
					report.skipped.push({ filePath: file.path, reason: plan.errors[0] });
					continue;
				}
				plans.push({ file, plan });
			}

			const conflicts = plans.filter(({ plan }) => plan.conflictRuleIds.length > 0);
			const confirmed = await confirmDualPropertyBatch(this.app, {
				totalFiles: files.length,
				changeFiles: plans.filter(({ plan }) => plan.changed).length,
				repairFiles: plans.filter(({ plan }) => plan.repaired).length,
				conflictFiles: conflicts.length,
				skippedFiles: report.skipped.length,
			}, 'sync');
			if (!confirmed) return;
			if (cancelled) {
				new Notice(t('sync.batchCancelled'));
				return;
			}

			let choices: Record<string, DualPropertyConflictChoice> = {};
			if (conflicts.length > 0) {
				const resolved = await resolveDualPropertyConflicts(this.app, conflicts.map(({ plan }) => ({
					filePath: plan.filePath,
					ruleIds: plan.conflictRuleIds,
				})));
				if (!resolved) return;
				choices = resolved;
			}
			if (cancelled) {
				new Notice(t('sync.batchCancelled'));
				return;
			}

			for (let index = 0; index < plans.length; index += 1) {
				if (cancelled) {
					new Notice(t('sync.batchCancelledRemaining'));
					break;
				}
				if (index % BATCH_YIELD_EVERY === 0) {
					status.setMessage(t('sync.applyingProgress', { current: index, total: plans.length }));
					await yieldToMainThread();
				}
				let { plan } = plans[index];
				const { file } = plans[index];
				if (plan.conflictRuleIds.length > 0) {
					const choice = choices[file.path] ?? 'skip';
					if (choice === 'skip') {
						report.conflicts.push(file.path);
						continue;
					}
					plan = resolveDualPropertySyncPlan(plan, context.rules, choice);
				}
				const result = await this.applySyncPlan(file, plan, context.rules, context.fingerprint);
				if (result === 'changed') {
					report.changed.push(file.path);
					if (plan.repaired) report.repaired.push(file.path);
				} else if (result === 'unchanged') {
					report.unchanged.push(file.path);
				} else {
					report.skipped.push({ filePath: file.path, reason: t('sync.fileChangedAfterScan') });
				}
			}
			await this.persistStateNow();
			showDualPropertyBatchReport(this.app, report);
		} finally {
			status.hide();
			this.batchRunning = false;
		}
	}

	async returnSelectedFoldersToLogseqOnly(): Promise<void> {
		if (this.batchRunning) {
			new Notice(t('sync.batchBusy'));
			return;
		}
		const context = this.getRuleContext();
		if (!context) return;
		const folders = parseFolderScope(this.callbacks.getSettings().dualPagePropertyFolders);
		if (folders.errors.length > 0 || folders.paths.length === 0) {
			new Notice(folders.errors[0] ?? t('sync.cleanupAddFolder'));
			return;
		}

		this.batchRunning = true;
		let cancelled = false;
		const status = new CancelableBatchNotice(t('sync.checkingCleanup'), () => {
			cancelled = true;
		});
		try {
			const files = this.getScopedMarkdownFiles(folders.paths);
			const candidates: CleanupCandidate[] = [];
			const report = createReport('cleanup');
			for (let index = 0; index < files.length; index += 1) {
				if (cancelled) {
					new Notice(t('sync.cleanupCancelled'));
					return;
				}
				if (index % BATCH_YIELD_EVERY === 0) await yieldToMainThread();
				const file = files[index];
				const originalContent = await this.app.vault.read(file);
				const repair = repairBulletizedYaml(originalContent, context.rules);
				if (repair.status === 'unsafe') {
					report.skipped.push({ filePath: file.path, reason: repair.reason ?? t('sync.damagedYamlUnsafe') });
					continue;
				}
				const workingContent = repair.content;
				const analysis = analyzeDualPropertyDocument(workingContent, context.rules);
				if (!analysis.frontmatterRaw) {
					report.unchanged.push(file.path);
					continue;
				}
				const unsafeReason = resolveCleanupUnsafeReason(analysis, context.rules.map((rule) => rule.id));
				if (unsafeReason) {
					report.skipped.push({ filePath: file.path, reason: unsafeReason });
					continue;
				}
				const removed = removeFrontmatter(workingContent);
				if (removed.errors.length > 0) {
					report.skipped.push({ filePath: file.path, reason: removed.errors[0] });
					continue;
				}
				candidates.push({
					file,
					originalContent,
					finalContent: removed.content,
					frontmatter: analysis.frontmatterRaw,
					repaired: repair.status === 'safe',
				});
			}

			const confirmed = await confirmDualPropertyBatch(this.app, {
				totalFiles: files.length,
				changeFiles: candidates.length,
				repairFiles: candidates.filter((candidate) => candidate.repaired).length,
				conflictFiles: 0,
				skippedFiles: report.skipped.length,
			}, 'cleanup');
			if (!confirmed) return;
			if (cancelled) {
				new Notice(t('sync.cleanupCancelled'));
				return;
			}

			const recoveryEntries: DualPropertyCleanupRecoveryEntry[] = [];
			for (const candidate of candidates) {
				if (cancelled) {
					new Notice(t('sync.cleanupCancelledRemaining'));
					break;
				}
				const applied = await this.applyExactContent(candidate.file, candidate.originalContent, candidate.finalContent);
				if (!applied) {
					report.skipped.push({ filePath: candidate.file.path, reason: t('sync.fileChangedAfterScan') });
					continue;
				}
				report.changed.push(candidate.file.path);
				if (candidate.repaired) report.repaired.push(candidate.file.path);
				recoveryEntries.push({ filePath: candidate.file.path, frontmatter: candidate.frontmatter });
				delete this.state.snapshots[candidate.file.path];
			}
			if (cancelled) {
				await this.persistStateNow();
				showDualPropertyBatchReport(this.app, report);
				return;
			}

			if (recoveryEntries.length > 0) {
				this.state.cleanupRecoveryJobs = [
					...this.state.cleanupRecoveryJobs,
					{ createdAt: Date.now(), entries: recoveryEntries },
				].slice(-3);
			}
			await this.callbacks.disableSync();
			await this.persistStateNow();
			showDualPropertyBatchReport(this.app, report);
		} finally {
			status.hide();
			this.batchRunning = false;
		}
	}

	handleFileChanged(file: TFile) {
		if (!this.shouldMonitor(file.path)) return;
		const existing = this.repairTimers.get(file.path);
		if (existing !== undefined) window.clearTimeout(existing);
		const timer = window.setTimeout(() => {
			this.repairTimers.delete(file.path);
			void this.observeAndRepairFile(file);
		}, REPAIR_DEBOUNCE_MS);
		this.repairTimers.set(file.path, timer);
	}

	handleFileOpened(file: TFile | null) {
		if (file) this.handleFileChanged(file);
	}

	handleFileDeleted(path: string) {
		delete this.state.snapshots[path];
		delete this.state.repairGuards[path];
		this.scheduleStateSave();
	}

	handleFileRenamed(oldPath: string, newPath: string) {
		if (this.state.snapshots[oldPath]) {
			this.state.snapshots[newPath] = this.state.snapshots[oldPath];
			delete this.state.snapshots[oldPath];
		}
		if (this.state.repairGuards[oldPath]) {
			this.state.repairGuards[newPath] = this.state.repairGuards[oldPath];
			delete this.state.repairGuards[oldPath];
		}
		this.scheduleStateSave();
	}

	private async observeAndRepairFile(file: TFile) {
		if (!this.shouldMonitor(file.path) || this.app.vault.getAbstractFileByPath(file.path) !== file) return;
		const context = this.getRuleContext(false);
		if (!context) return;
		const content = await this.app.vault.read(file);
		const contentHash = stableHash(content);
		if (this.ownWriteHashes.get(file.path) === contentHash) {
			this.ownWriteHashes.delete(file.path);
			return;
		}

		const observed = observeDualPropertyChanges({
			content,
			rules: context.rules,
			rulesFingerprint: context.fingerprint,
			snapshot: this.state.snapshots[file.path],
		});
		if (observed) {
			this.state.snapshots[file.path] = observed;
			this.scheduleStateSave();
		}

		const guard = this.state.repairGuards[file.path] ?? { repairTimestamps: [] };
		if (guard.suspendedAt && Date.now() - guard.suspendedAt < REPAIR_WINDOW_MS) return;
		if (guard.suspendedAt) {
			delete guard.suspendedAt;
			guard.repairTimestamps = [];
		}
		const repair = repairBulletizedYaml(content, context.rules);
		if (repair.status !== 'safe' || guard.lastAttemptedBrokenHash === contentHash) return;

		const now = Date.now();
		guard.repairTimestamps = guard.repairTimestamps.filter((time) => now - time < REPAIR_WINDOW_MS);
		guard.lastAttemptedBrokenHash = contentHash;
		if (guard.repairTimestamps.length >= MAX_REPAIRS_PER_WINDOW) {
			guard.suspendedAt = now;
			this.state.repairGuards[file.path] = guard;
			this.scheduleStateSave();
			new Notice(t('sync.repairSuspended', { path: file.path }));
			return;
		}

		const applied = await this.applyExactContent(file, content, repair.content);
		if (applied) {
			guard.repairTimestamps.push(now);
			this.state.repairGuards[file.path] = guard;
			this.scheduleStateSave();
			new Notice(t('sync.repaired', { path: file.path }));
		}
	}

	private async applySyncPlan(
		file: TFile,
		plan: DualPropertySyncPlan,
		rules: ReturnType<typeof parseDualPropertyRules>['rules'],
		rulesFingerprint: string,
	): Promise<'changed' | 'unchanged' | 'stale'> {
		const materialized = materializeDualPropertySyncPlan(plan, rules);
		if (materialized.errors.length > 0) return 'stale';
		if (materialized.content === plan.originalContent) {
			delete this.state.repairGuards[file.path];
			this.state.snapshots[file.path] = createDualPropertySnapshot({
				content: materialized.content,
				rules,
				rulesFingerprint,
				previous: this.state.snapshots[file.path],
			});
			this.scheduleStateSave();
			return 'unchanged';
		}
		const applied = await this.applyExactContent(file, plan.originalContent, materialized.content);
		if (!applied) return 'stale';
		delete this.state.repairGuards[file.path];
		this.state.snapshots[file.path] = createDualPropertySnapshot({
			content: materialized.content,
			rules,
			rulesFingerprint,
			previous: this.state.snapshots[file.path],
		});
		this.scheduleStateSave();
		return 'changed';
	}

	private async applyExactContent(file: TFile, expectedContent: string, finalContent: string): Promise<boolean> {
		let applied = false;
		await this.app.vault.process(file, (currentContent) => {
			if (currentContent !== expectedContent) return currentContent;
			applied = true;
			return finalContent;
		});
		if (applied) this.ownWriteHashes.set(file.path, stableHash(finalContent));
		return applied;
	}

	private getRuleContext(showNotice = true) {
		const settings = this.callbacks.getSettings();
		if (!settings.enableDualPagePropertySync) {
			if (showNotice) new Notice(t('sync.enableFirst'));
			return null;
		}
		const parsed = parseDualPropertyRules(settings.dualPagePropertyWhitelist);
		if (parsed.errors.length > 0 || parsed.rules.length === 0) {
			if (showNotice) new Notice(parsed.errors[0] ?? t('sync.addWhitelistRule'));
			return null;
		}
		return parsed;
	}

	private shouldMonitor(filePath: string): boolean {
		const settings = this.callbacks.getSettings();
		if (!settings.enableDualPagePropertySync) return false;
		const folders = parseFolderScope(settings.dualPagePropertyFolders);
		return folders.errors.length === 0 && folders.paths.some((folder) => pathIsInFolder(filePath, folder));
	}

	private getScopedMarkdownFiles(folders: string[]): TFile[] {
		return this.app.vault.getMarkdownFiles().filter((file) => folders.some((folder) => pathIsInFolder(file.path, folder)));
	}

	private scheduleStateSave() {
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.callbacks.saveState(this.state);
		}, STATE_SAVE_DEBOUNCE_MS);
	}

	private async persistStateNow() {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		await this.callbacks.saveState(this.state);
	}
}

export function parseFolderScope(text: string): { paths: string[]; errors: string[] } {
	const paths: string[] = [];
	const errors: string[] = [];
	for (const [index, rawLine] of text.split(/\r?\n/u).entries()) {
		const raw = rawLine.trim();
		if (!raw) continue;
		const normalizedSeparators = raw.replace(/\\/gu, '/');
		if (/^[A-Za-z]:\//u.test(normalizedSeparators) || normalizedSeparators.startsWith('/') || normalizedSeparators.split('/').includes('..')) {
			errors.push(t('validation.folder.invalid', { line: index + 1 }));
			continue;
		}
		const normalized = raw === '.' ? '.' : normalizedSeparators.replace(/^\/+|\/+$/gu, '');
		if (!paths.includes(normalized)) paths.push(normalized);
	}
	return { paths, errors };
}

function pathIsInFolder(filePath: string, folder: string): boolean {
	return folder === '.' || filePath === folder || filePath.startsWith(`${folder}/`);
}

function resolveCleanupUnsafeReason(
	analysis: ReturnType<typeof analyzeDualPropertyDocument>,
	ruleIds: string[],
): string | null {
	if (analysis.errors.length > 0) return analysis.errors[0];
	if (analysis.hasUnmanagedYaml) return t('validation.cleanup.unmanagedYaml');
	for (const ruleId of ruleIds) {
		const yamlValue = analysis.yaml.values[ruleId] ?? null;
		const logseqValue = analysis.logseq.values[ruleId] ?? null;
		if (yamlValue !== null && (logseqValue === null || !valuesEqual(yamlValue, logseqValue))) {
			return t('validation.cleanup.notEquivalent', { key: ruleId });
		}
	}
	return null;
}

function createReport(operation: 'sync' | 'cleanup'): DualPropertyBatchReport {
	return { operation, changed: [], repaired: [], unchanged: [], skipped: [], conflicts: [] };
}

function yieldToMainThread(): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, 0));
}

class CancelableBatchNotice {
	private readonly notice: Notice;
	private readonly messageEl: HTMLSpanElement;

	constructor(message: string, onCancel: () => void) {
		const fragment = activeDocument.createDocumentFragment();
		this.messageEl = activeDocument.createElement('span');
		this.messageEl.textContent = message;
		const cancelButton = activeDocument.createElement('button');
		cancelButton.textContent = t('sync.cancelButton');
		cancelButton.addClass('block-reference-dual-property-cancel');
		cancelButton.addEventListener('click', () => {
			cancelButton.disabled = true;
			this.messageEl.textContent = t('sync.cancelling');
			onCancel();
		});
		fragment.append(this.messageEl, cancelButton);
		this.notice = new Notice(fragment, 0);
	}

	setMessage(message: string) {
		this.messageEl.textContent = message;
	}

	hide() {
		this.notice.hide();
	}
}
