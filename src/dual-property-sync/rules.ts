import type {
	DualPropertyRuleParseResult,
	DualPropertySyncRule,
	DualPropertyValue,
} from './types';

export const DEFAULT_DUAL_PROPERTY_WHITELIST = 'alias<->aliases';

const PROTECTED_KEYS = new Set([
	'id',
	'collapsed',
	'created-at',
	'updated-at',
]);

const VALID_KEY_REGEX = /^[^\s:<>{}\[\]]+$/u;

export function parseDualPropertyRules(text: string): DualPropertyRuleParseResult {
	const rules: DualPropertySyncRule[] = [];
	const errors: string[] = [];
	const logseqKeys = new Set<string>();
	const yamlKeys = new Set<string>();

	text.split(/\r?\n/u).forEach((rawLine, index) => {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) {
			return;
		}

		const parts = line.split('<->');
		if (parts.length > 2) {
			errors.push(`Line ${index + 1}: use at most one <-> mapping operator.`);
			return;
		}

		let logseqKey = normalizeRuleKey(parts[0]);
		let yamlKey = parts.length === 2 ? normalizeRuleKey(parts[1]) : logseqKey;
		if (!logseqKey || !yamlKey || !VALID_KEY_REGEX.test(logseqKey) || !VALID_KEY_REGEX.test(yamlKey)) {
			errors.push(`Line ${index + 1}: property keys cannot contain spaces or YAML punctuation.`);
			return;
		}

		const normalizedLogseqKey = logseqKey.toLocaleLowerCase();
		const normalizedYamlKey = yamlKey.toLocaleLowerCase();
		if (PROTECTED_KEYS.has(normalizedLogseqKey) || PROTECTED_KEYS.has(normalizedYamlKey)) {
			errors.push(`Line ${index + 1}: ${logseqKey}<->${yamlKey} contains a protected block property.`);
			return;
		}

		if (logseqKeys.has(normalizedLogseqKey)) {
			errors.push(`Line ${index + 1}: Logseq key ${logseqKey} is already mapped.`);
			return;
		}

		if (yamlKeys.has(normalizedYamlKey)) {
			errors.push(`Line ${index + 1}: YAML key ${yamlKey} is already mapped.`);
			return;
		}

		logseqKeys.add(normalizedLogseqKey);
		yamlKeys.add(normalizedYamlKey);
		const codec = normalizedLogseqKey === 'alias' && normalizedYamlKey === 'aliases'
			? 'aliases'
			: 'string';
		rules.push({
			id: `${logseqKey}<->${yamlKey}`,
			logseqKey,
			yamlKey,
			codec,
		});
	});

	const normalizedText = rules.map((rule) => {
		return rule.logseqKey === rule.yamlKey ? rule.logseqKey : `${rule.logseqKey}<->${rule.yamlKey}`;
	}).join('\n');

	return {
		rules,
		normalizedText,
		errors,
		fingerprint: stableHash(normalizedText),
	};
}

export function normalizeRuleValue(rule: DualPropertySyncRule, rawValue: string): DualPropertyValue {
	if (rule.codec === 'aliases') {
		return rawValue
			.split(/[,，]/u)
			.map((value) => value.trim())
			.filter(Boolean);
	}

	return [rawValue];
}

export function serializeLogseqRuleValue(rule: DualPropertySyncRule, value: DualPropertyValue): string | null {
	if (value === null) {
		return null;
	}

	return rule.codec === 'aliases' ? value.join(', ') : (value[0] ?? '');
}

export function canonicalizeValue(value: DualPropertyValue): DualPropertyValue {
	return value === null ? null : value.map((item) => String(item));
}

export function valuesEqual(left: DualPropertyValue, right: DualPropertyValue): boolean {
	return JSON.stringify(canonicalizeValue(left)) === JSON.stringify(canonicalizeValue(right));
}

export function hashRuleValues(values: Record<string, DualPropertyValue>): string {
	const sorted = Object.keys(values).sort().map((key) => [key, canonicalizeValue(values[key])]);
	return stableHash(JSON.stringify(sorted));
}

export function stableHash(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeRuleKey(value: string | undefined): string {
	return (value ?? '').trim().replace(/::$/u, '').trim();
}
