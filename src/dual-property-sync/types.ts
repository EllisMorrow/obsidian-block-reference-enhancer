export type DualPropertyValue = string[] | null;

export interface DualPropertySyncRule {
	id: string;
	logseqKey: string;
	yamlKey: string;
	codec: 'aliases' | 'string';
}

export interface DualPropertyRuleParseResult {
	rules: DualPropertySyncRule[];
	normalizedText: string;
	errors: string[];
	fingerprint: string;
}

export interface DualPropertySideValues {
	values: Record<string, DualPropertyValue>;
	hash: string;
}

export interface DualPropertyFileSnapshot {
	rulesFingerprint: string;
	yamlValues: Record<string, DualPropertyValue>;
	logseqValues: Record<string, DualPropertyValue>;
	yamlHash: string;
	logseqHash: string;
	lastObservedYamlHash: string;
	lastObservedLogseqHash: string;
	yamlChangedAt?: number;
	logseqChangedAt?: number;
	lastSyncedAt: number;
}

export interface DualPropertyRepairGuard {
	lastAttemptedBrokenHash?: string;
	repairTimestamps: number[];
	suspendedAt?: number;
}

export interface DualPropertyCleanupRecoveryEntry {
	filePath: string;
	frontmatter: string;
}

export interface DualPropertyCleanupRecoveryJob {
	createdAt: number;
	entries: DualPropertyCleanupRecoveryEntry[];
}

export interface PersistedDualPropertySyncState {
	schemaVersion: 1;
	snapshots: Record<string, DualPropertyFileSnapshot>;
	repairGuards: Record<string, DualPropertyRepairGuard>;
	cleanupRecoveryJobs: DualPropertyCleanupRecoveryJob[];
}

export interface DualPropertyConflict {
	filePath: string;
	ruleIds: string[];
}

export type DualPropertyConflictChoice = 'yaml' | 'logseq' | 'skip';

export interface DualPropertyBatchSummary {
	totalFiles: number;
	changeFiles: number;
	repairFiles: number;
	conflictFiles: number;
	skippedFiles: number;
}

export interface DualPropertyBatchReport {
	operation: 'sync' | 'cleanup';
	changed: string[];
	repaired: string[];
	unchanged: string[];
	skipped: Array<{ filePath: string; reason: string }>;
	conflicts: string[];
}

export function createEmptyDualPropertySyncState(): PersistedDualPropertySyncState {
	return {
		schemaVersion: 1,
		snapshots: {},
		repairGuards: {},
		cleanupRecoveryJobs: [],
	};
}

export function normalizePersistedDualPropertySyncState(value: unknown): PersistedDualPropertySyncState {
	if (!value || typeof value !== 'object') {
		return createEmptyDualPropertySyncState();
	}

	const candidate = value as Partial<PersistedDualPropertySyncState>;
	if (candidate.schemaVersion !== 1) {
		return createEmptyDualPropertySyncState();
	}

	return {
		schemaVersion: 1,
		snapshots: candidate.snapshots && typeof candidate.snapshots === 'object' ? candidate.snapshots : {},
		repairGuards: candidate.repairGuards && typeof candidate.repairGuards === 'object' ? candidate.repairGuards : {},
		cleanupRecoveryJobs: Array.isArray(candidate.cleanupRecoveryJobs)
			? candidate.cleanupRecoveryJobs.slice(-3)
			: [],
	};
}
