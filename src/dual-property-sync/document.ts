import { Document, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import {
	canonicalizeValue,
	hashRuleValues,
	normalizeRuleValue,
	serializeLogseqRuleValue,
} from './rules';
import type {
	DualPropertySideValues,
	DualPropertySyncRule,
	DualPropertyValue,
} from './types';

interface TextLine {
	text: string;
	start: number;
	end: number;
	fullEnd: number;
}

interface FrontmatterRegion {
	start: number;
	end: number;
	after: number;
	yamlSource: string;
	document: Document;
}

interface LogseqPropertyLine {
	key: string;
	value: string;
	line: TextLine;
}

interface ParsedPageProperties {
	lines: TextLine[];
	frontmatter: FrontmatterRegion | null;
	properties: LogseqPropertyLine[];
	propertyInsertionOffset: number;
	eol: string;
	bomLength: number;
	errors: string[];
}

export interface DualPropertyDocumentAnalysis {
	yaml: DualPropertySideValues;
	logseq: DualPropertySideValues;
	errors: string[];
	frontmatterRaw: string | null;
	hasUnmanagedYaml: boolean;
}

export interface DualPropertyDocumentUpdateResult {
	content: string;
	changed: boolean;
	errors: string[];
}

export interface BulletizedYamlRepairResult {
	status: 'not-needed' | 'safe' | 'unsafe';
	content: string;
	reason?: string;
}

export function analyzeDualPropertyDocument(
	content: string,
	rules: DualPropertySyncRule[],
): DualPropertyDocumentAnalysis {
	const parsed = parsePageProperties(content);
	const yamlValues = createEmptyValues(rules);
	const logseqValues = createEmptyValues(rules);
	const errors = [...parsed.errors];

	if (parsed.frontmatter) {
		readYamlValues(parsed.frontmatter.document, rules, yamlValues, errors);
	}

	readLogseqValues(parsed.properties, rules, logseqValues, errors);
	const managedYamlKeys = new Set(rules.map((rule) => rule.yamlKey));
	const hasUnmanagedYaml = !!parsed.frontmatter
		&& isMap(parsed.frontmatter.document.contents)
		&& parsed.frontmatter.document.contents.items.some((pair) => {
			const key = isScalar(pair.key) ? String(pair.key.value) : '';
			return !managedYamlKeys.has(key);
		});

	return {
		yaml: { values: yamlValues, hash: hashRuleValues(yamlValues) },
		logseq: { values: logseqValues, hash: hashRuleValues(logseqValues) },
		errors,
		frontmatterRaw: parsed.frontmatter ? content.slice(parsed.frontmatter.start, parsed.frontmatter.end) : null,
		hasUnmanagedYaml,
	};
}

export function updateDualPropertyDocument(
	content: string,
	rules: DualPropertySyncRule[],
	targetValues: Record<string, DualPropertyValue>,
): DualPropertyDocumentUpdateResult {
	const yamlUpdate = updateYaml(content, rules, targetValues);
	if (yamlUpdate.errors.length > 0) {
		return yamlUpdate;
	}

	const logseqUpdate = updateLogseqProperties(yamlUpdate.content, rules, targetValues);
	return {
		content: logseqUpdate.content,
		changed: logseqUpdate.content !== content,
		errors: logseqUpdate.errors,
	};
}

export function removeFrontmatter(content: string): DualPropertyDocumentUpdateResult {
	const parsed = parsePageProperties(content);
	if (parsed.errors.length > 0) {
		return { content, changed: false, errors: parsed.errors };
	}
	if (!parsed.frontmatter) {
		return { content, changed: false, errors: [] };
	}

	let after = parsed.frontmatter.after;
	if (content.slice(after).startsWith(parsed.eol)) {
		after += parsed.eol.length;
	}
	const updated = `${content.slice(0, parsed.frontmatter.start)}${content.slice(after)}`;
	return { content: updated, changed: updated !== content, errors: [] };
}

export function repairBulletizedYaml(
	content: string,
	rules: DualPropertySyncRule[],
): BulletizedYamlRepairResult {
	const bom = content.startsWith('\uFEFF') ? '\uFEFF' : '';
	const body = content.slice(bom.length);
	const eol = detectEol(content);
	const lines = body.split(/\r?\n/u);
	if (lines[0]?.trimEnd() !== '- ---') {
		return { status: 'not-needed', content };
	}

	let closingIndex = -1;
	for (let index = 1; index < lines.length; index += 1) {
		if (/^ {2}---[ \t]*$/u.test(lines[index])) {
			closingIndex = index;
			break;
		}
		if (lines[index] && !lines[index].startsWith('  ')) {
			return { status: 'unsafe', content, reason: 'The bulletized YAML header has inconsistent indentation.' };
		}
	}
	if (closingIndex < 1) {
		return { status: 'unsafe', content, reason: 'The bulletized YAML closing delimiter was not found.' };
	}

	const yamlLines = lines.slice(1, closingIndex).map((line) => line.startsWith('  ') ? line.slice(2) : line);
	const yamlSource = yamlLines.join('\n');
	const yamlDocument = parseDocument(yamlSource, { prettyErrors: false, keepSourceTokens: true });
	if (yamlDocument.errors.length > 0 || !isMap(yamlDocument.contents)) {
		return { status: 'unsafe', content, reason: 'The de-indented YAML is not a valid top-level mapping.' };
	}

	const yamlKeys = new Set(yamlDocument.contents.items.map((pair) => {
		return isScalar(pair.key) ? String(pair.key.value) : '';
	}));
	let propertyEnd = closingIndex + 1;
	const pagePropertyKeys = new Set<string>();
	while (propertyEnd < lines.length) {
		const match = lines[propertyEnd].match(/^ {2}([^\s:][^:]*)::(?:\s?(.*))?$/u);
		if (!match) {
			break;
		}
		pagePropertyKeys.add(match[1].trim());
		propertyEnd += 1;
	}

	const hasManagedEvidence = rules.some((rule) => {
		return yamlKeys.has(rule.yamlKey) || pagePropertyKeys.has(rule.logseqKey);
	});
	if (!hasManagedEvidence) {
		return { status: 'unsafe', content, reason: 'No whitelisted page property was found in the damaged header.' };
	}

	const repairedLines = [
		'---',
		...yamlLines,
		'---',
		...lines.slice(closingIndex + 1, propertyEnd).map((line) => line.slice(2)),
		...lines.slice(propertyEnd),
	];
	return { status: 'safe', content: `${bom}${repairedLines.join(eol)}` };
}

function parsePageProperties(content: string): ParsedPageProperties {
	const eol = detectEol(content);
	const bomLength = content.startsWith('\uFEFF') ? 1 : 0;
	const lines = splitLines(content);
	const errors: string[] = [];
	let frontmatter: FrontmatterRegion | null = null;
	let searchOffset = bomLength;
	const openingLineIndex = lines.findIndex((line) => line.start === bomLength);

	if (openingLineIndex >= 0 && /^---[ \t]*$/u.test(lines[openingLineIndex].text)) {
		let closingLine: TextLine | null = null;
		for (let index = openingLineIndex + 1; index < lines.length; index += 1) {
			if (/^---[ \t]*$/u.test(lines[index].text)) {
				closingLine = lines[index];
				break;
			}
		}
		if (!closingLine) {
			errors.push('YAML frontmatter does not have a closing delimiter.');
		} else {
			const yamlStart = lines[openingLineIndex].fullEnd;
			const yamlSource = content.slice(yamlStart, closingLine.start);
			const document = parseDocument(yamlSource, { prettyErrors: false, keepSourceTokens: true });
			if (document.errors.length > 0 || (document.contents !== null && !isMap(document.contents))) {
				errors.push('YAML frontmatter must be a valid top-level mapping.');
			}
			frontmatter = {
				start: lines[openingLineIndex].start,
				end: closingLine.end,
				after: closingLine.fullEnd,
				yamlSource,
				document,
			};
			searchOffset = closingLine.fullEnd;
		}
	}

	let lineIndex = lines.findIndex((line) => line.start >= searchOffset);
	if (lineIndex < 0) {
		lineIndex = lines.length;
	}
	while (lineIndex < lines.length && lines[lineIndex].text.trim() === '') {
		lineIndex += 1;
	}

	const properties: LogseqPropertyLine[] = [];
	let propertyInsertionOffset = lineIndex < lines.length ? lines[lineIndex].start : content.length;
	while (lineIndex < lines.length) {
		const match = lines[lineIndex].text.match(/^([^\s:][^:]*)::(?:\s?(.*))?$/u);
		if (!match) {
			break;
		}
		properties.push({
			key: match[1].trim(),
			value: match[2] ?? '',
			line: lines[lineIndex],
		});
		propertyInsertionOffset = lines[lineIndex].fullEnd;
		lineIndex += 1;
	}

	return { lines, frontmatter, properties, propertyInsertionOffset, eol, bomLength, errors };
}

function readYamlValues(
	document: Document,
	rules: DualPropertySyncRule[],
	values: Record<string, DualPropertyValue>,
	errors: string[],
) {
	for (const rule of rules) {
		if (!document.has(rule.yamlKey)) {
			continue;
		}
		const node = document.get(rule.yamlKey, true);
		if (rule.codec === 'aliases') {
			if (isSeq(node) && node.items.every(isScalar)) {
				const items = node.items.map((item) => String(item.value));
				if (items.some((item) => /[,，\r\n]/u.test(item))) {
					errors.push(`YAML property ${rule.yamlKey} contains an alias that cannot be represented safely in one Logseq property line.`);
					continue;
				}
				values[rule.id] = items;
				continue;
			}
			if (isScalar(node)) {
				values[rule.id] = normalizeRuleValue(rule, String(node.value));
				continue;
			}
			errors.push(`YAML property ${rule.yamlKey} must be a scalar or scalar list.`);
			continue;
		}

		if (isScalar(node) && typeof node.value === 'string' && !/[\r\n]/u.test(node.value)) {
			values[rule.id] = [node.value];
		} else {
			errors.push(`YAML property ${rule.yamlKey} must be a string.`);
		}
	}
}

function readLogseqValues(
	properties: LogseqPropertyLine[],
	rules: DualPropertySyncRule[],
	values: Record<string, DualPropertyValue>,
	errors: string[],
) {
	for (const rule of rules) {
		const matching = properties.filter((property) => property.key === rule.logseqKey);
		if (matching.length > 1) {
			errors.push(`Logseq page property ${rule.logseqKey} appears more than once.`);
			continue;
		}
		if (matching.length === 1) {
			values[rule.id] = canonicalizeValue(normalizeRuleValue(rule, matching[0].value));
		}
	}
}

function updateYaml(
	content: string,
	rules: DualPropertySyncRule[],
	targetValues: Record<string, DualPropertyValue>,
): DualPropertyDocumentUpdateResult {
	const parsed = parsePageProperties(content);
	if (parsed.errors.length > 0) {
		return { content, changed: false, errors: parsed.errors };
	}

	const document = parsed.frontmatter?.document ?? new Document({});
	for (const rule of rules) {
		const value = targetValues[rule.id] ?? null;
		if (value === null) {
			document.delete(rule.yamlKey);
		} else if (rule.codec === 'aliases') {
			document.set(rule.yamlKey, value);
		} else {
			document.set(rule.yamlKey, value[0] ?? '');
		}
	}

	const hasYamlEntries = isMap(document.contents) && document.contents.items.length > 0;
	if (parsed.frontmatter) {
		if (!hasYamlEntries) {
			return removeFrontmatter(content);
		}
		const yaml = normalizeYamlLineEndings(document.toString({ lineWidth: 0 }).trimEnd(), parsed.eol);
		const replacement = `---${parsed.eol}${yaml}${parsed.eol}---`;
		const updated = replaceRange(content, parsed.frontmatter.start, parsed.frontmatter.end, replacement);
		return { content: updated, changed: updated !== content, errors: [] };
	}

	if (!hasYamlEntries) {
		return { content, changed: false, errors: [] };
	}
	const yaml = normalizeYamlLineEndings(document.toString({ lineWidth: 0 }).trimEnd(), parsed.eol);
	const prefix = `---${parsed.eol}${yaml}${parsed.eol}---${parsed.eol}${parsed.eol}`;
	const updated = `${content.slice(0, parsed.bomLength)}${prefix}${content.slice(parsed.bomLength)}`;
	return { content: updated, changed: true, errors: [] };
}

function updateLogseqProperties(
	content: string,
	rules: DualPropertySyncRule[],
	targetValues: Record<string, DualPropertyValue>,
): DualPropertyDocumentUpdateResult {
	const parsed = parsePageProperties(content);
	if (parsed.errors.length > 0) {
		return { content, changed: false, errors: parsed.errors };
	}

	const edits: Array<{ from: number; to: number; insert: string }> = [];
	const additions: string[] = [];
	for (const rule of rules) {
		const matches = parsed.properties.filter((property) => property.key === rule.logseqKey);
		if (matches.length > 1) {
			return { content, changed: false, errors: [`Logseq page property ${rule.logseqKey} appears more than once.`] };
		}
		const serialized = serializeLogseqRuleValue(rule, targetValues[rule.id] ?? null);
		if (matches.length === 1) {
			const line = matches[0].line;
			if (serialized === null) {
				edits.push({ from: line.start, to: line.fullEnd, insert: '' });
			} else {
				edits.push({ from: line.start, to: line.end, insert: `${rule.logseqKey}:: ${serialized}` });
			}
		} else if (serialized !== null) {
			additions.push(`${rule.logseqKey}:: ${serialized}`);
		}
	}

	if (additions.length > 0) {
		const insertionOffset = parsed.propertyInsertionOffset;
		const before = content.slice(0, insertionOffset);
		const after = content.slice(insertionOffset);
		const leading = before.length > 0 && !before.endsWith(parsed.eol) ? parsed.eol : '';
		const trailing = after.length > 0
			? parsed.properties.length === 0 ? `${parsed.eol}${parsed.eol}` : parsed.eol
			: parsed.eol;
		edits.push({
			from: insertionOffset,
			to: insertionOffset,
			insert: `${leading}${additions.join(parsed.eol)}${trailing}`,
		});
	}

	const updated = applyEdits(content, edits);
	return { content: updated, changed: updated !== content, errors: [] };
}

function createEmptyValues(rules: DualPropertySyncRule[]): Record<string, DualPropertyValue> {
	return Object.fromEntries(rules.map((rule) => [rule.id, null]));
}

function splitLines(content: string): TextLine[] {
	const lines: TextLine[] = [];
	const regex = /.*?(?:\r\n|\n|$)/gu;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(content)) !== null) {
		if (match[0] === '' && match.index === content.length) {
			break;
		}
		const full = match[0];
		const text = full.replace(/\r?\n$/u, '');
		lines.push({
			text,
			start: match.index,
			end: match.index + text.length,
			fullEnd: match.index + full.length,
		});
		if (regex.lastIndex >= content.length) {
			break;
		}
	}
	return lines;
}

function applyEdits(content: string, edits: Array<{ from: number; to: number; insert: string }>): string {
	return [...edits]
		.sort((left, right) => right.from - left.from || right.to - left.to)
		.reduce((result, edit) => replaceRange(result, edit.from, edit.to, edit.insert), content);
}

function replaceRange(content: string, from: number, to: number, insert: string): string {
	return `${content.slice(0, from)}${insert}${content.slice(to)}`;
}

function detectEol(content: string): string {
	return content.includes('\r\n') ? '\r\n' : '\n';
}

function normalizeYamlLineEndings(value: string, eol: string): string {
	return value.replace(/\r?\n/gu, eol);
}
