import {
	analyzeDualPropertyDocument,
	repairBulletizedYaml,
	updateDualPropertyDocument,
} from './document';
import { valuesEqual } from './rules';
import { t } from '../i18n';
import type {
	DualPropertyConflictChoice,
	DualPropertyFileSnapshot,
	DualPropertySyncRule,
	DualPropertyValue,
} from './types';

export interface DualPropertySyncPlan {
	filePath: string;
	originalContent: string;
	workingContent: string;
	rulesFingerprint: string;
	targetValues: Record<string, DualPropertyValue>;
	conflictRuleIds: string[];
	repaired: boolean;
	changed: boolean;
	errors: string[];
}

export function buildDualPropertySyncPlan(options: {
	filePath: string;
	content: string;
	rules: DualPropertySyncRule[];
	rulesFingerprint: string;
	snapshot?: DualPropertyFileSnapshot;
	allowRepair: boolean;
}): DualPropertySyncPlan {
	const repair = options.allowRepair
		? repairBulletizedYaml(options.content, options.rules)
		: { status: 'not-needed' as const, content: options.content };
	if (repair.status === 'unsafe') {
		return createErrorPlan(options, repair.reason ?? t('sync.damagedYamlUnsafe'));
	}

	const workingContent = repair.content;
	const analysis = analyzeDualPropertyDocument(workingContent, options.rules);
	if (analysis.errors.length > 0) {
		return createErrorPlan(options, analysis.errors, workingContent, repair.status === 'safe');
	}

	const snapshot = options.snapshot?.rulesFingerprint === options.rulesFingerprint
		? options.snapshot
		: undefined;
	const targetValues: Record<string, DualPropertyValue> = {};
	const conflictRuleIds: string[] = [];

	for (const rule of options.rules) {
		const yamlValue = analysis.yaml.values[rule.id] ?? null;
		const logseqValue = analysis.logseq.values[rule.id] ?? null;
		if (valuesEqual(yamlValue, logseqValue)) {
			targetValues[rule.id] = yamlValue;
			continue;
		}

		if (!snapshot) {
			if (yamlValue === null) {
				targetValues[rule.id] = logseqValue;
			} else if (logseqValue === null) {
				targetValues[rule.id] = yamlValue;
			} else {
				conflictRuleIds.push(rule.id);
				targetValues[rule.id] = yamlValue;
			}
			continue;
		}

		const baselineYaml = snapshot.yamlValues[rule.id] ?? null;
		const baselineLogseq = snapshot.logseqValues[rule.id] ?? null;
		const yamlChanged = !valuesEqual(yamlValue, baselineYaml);
		const logseqChanged = !valuesEqual(logseqValue, baselineLogseq);
		if (yamlChanged && !logseqChanged) {
			targetValues[rule.id] = yamlValue;
		} else if (logseqChanged && !yamlChanged) {
			targetValues[rule.id] = logseqValue;
		} else if (!yamlChanged && !logseqChanged) {
			conflictRuleIds.push(rule.id);
			targetValues[rule.id] = yamlValue;
		} else if (hasReliableNewerSide(snapshot, 'yaml')) {
			targetValues[rule.id] = yamlValue;
		} else if (hasReliableNewerSide(snapshot, 'logseq')) {
			targetValues[rule.id] = logseqValue;
		} else {
			conflictRuleIds.push(rule.id);
			targetValues[rule.id] = yamlValue;
		}
	}

	const update = updateDualPropertyDocument(workingContent, options.rules, targetValues);
	return {
		filePath: options.filePath,
		originalContent: options.content,
		workingContent,
		rulesFingerprint: options.rulesFingerprint,
		targetValues,
		conflictRuleIds,
		repaired: repair.status === 'safe',
		changed: update.changed || repair.status === 'safe',
		errors: update.errors,
	};
}

export function resolveDualPropertySyncPlan(
	plan: DualPropertySyncPlan,
	rules: DualPropertySyncRule[],
	choice: DualPropertyConflictChoice,
): DualPropertySyncPlan {
	if (plan.conflictRuleIds.length === 0 || choice === 'skip') {
		return plan;
	}

	const analysis = analyzeDualPropertyDocument(plan.workingContent, rules);
	const targetValues = { ...plan.targetValues };
	for (const ruleId of plan.conflictRuleIds) {
		targetValues[ruleId] = choice === 'yaml'
			? analysis.yaml.values[ruleId] ?? null
			: analysis.logseq.values[ruleId] ?? null;
	}
	const update = updateDualPropertyDocument(plan.workingContent, rules, targetValues);
	return {
		...plan,
		targetValues,
		conflictRuleIds: [],
		changed: update.changed || plan.repaired,
		errors: [...analysis.errors, ...update.errors],
	};
}

export function materializeDualPropertySyncPlan(
	plan: DualPropertySyncPlan,
	rules: DualPropertySyncRule[],
): { content: string; errors: string[] } {
	if (plan.conflictRuleIds.length > 0) {
		return { content: plan.originalContent, errors: [t('validation.sync.unresolvedConflicts')] };
	}
	return updateDualPropertyDocument(plan.workingContent, rules, plan.targetValues);
}

export function createDualPropertySnapshot(options: {
	content: string;
	rules: DualPropertySyncRule[];
	rulesFingerprint: string;
	previous?: DualPropertyFileSnapshot;
	now?: number;
}): DualPropertyFileSnapshot {
	const now = options.now ?? Date.now();
	const analysis = analyzeDualPropertyDocument(options.content, options.rules);
	return {
		rulesFingerprint: options.rulesFingerprint,
		yamlValues: analysis.yaml.values,
		logseqValues: analysis.logseq.values,
		yamlHash: analysis.yaml.hash,
		logseqHash: analysis.logseq.hash,
		lastObservedYamlHash: analysis.yaml.hash,
		lastObservedLogseqHash: analysis.logseq.hash,
		yamlChangedAt: options.previous?.yamlChangedAt,
		logseqChangedAt: options.previous?.logseqChangedAt,
		lastSyncedAt: now,
	};
}

export function observeDualPropertyChanges(options: {
	content: string;
	rules: DualPropertySyncRule[];
	rulesFingerprint: string;
	snapshot?: DualPropertyFileSnapshot;
	now?: number;
}): DualPropertyFileSnapshot | null {
	const snapshot = options.snapshot;
	if (!snapshot || snapshot.rulesFingerprint !== options.rulesFingerprint) {
		return null;
	}
	const analysis = analyzeDualPropertyDocument(options.content, options.rules);
	if (analysis.errors.length > 0) {
		return snapshot;
	}
	const now = options.now ?? Date.now();
	const yamlChanged = analysis.yaml.hash !== snapshot.lastObservedYamlHash;
	const logseqChanged = analysis.logseq.hash !== snapshot.lastObservedLogseqHash;
	return {
		...snapshot,
		lastObservedYamlHash: analysis.yaml.hash,
		lastObservedLogseqHash: analysis.logseq.hash,
		yamlChangedAt: yamlChanged ? now : snapshot.yamlChangedAt,
		logseqChangedAt: logseqChanged ? now : snapshot.logseqChangedAt,
	};
}

function hasReliableNewerSide(snapshot: DualPropertyFileSnapshot, side: 'yaml' | 'logseq'): boolean {
	const primary = side === 'yaml' ? snapshot.yamlChangedAt : snapshot.logseqChangedAt;
	const other = side === 'yaml' ? snapshot.logseqChangedAt : snapshot.yamlChangedAt;
	return typeof primary === 'number' && typeof other === 'number' && primary > other;
}

function createErrorPlan(
	options: {
		filePath: string;
		content: string;
		rulesFingerprint: string;
	},
	error: string | string[],
	workingContent = options.content,
	repaired = false,
): DualPropertySyncPlan {
	return {
		filePath: options.filePath,
		originalContent: options.content,
		workingContent,
		rulesFingerprint: options.rulesFingerprint,
		targetValues: {},
		conflictRuleIds: [],
		repaired,
		changed: false,
		errors: Array.isArray(error) ? error : [error],
	};
}
