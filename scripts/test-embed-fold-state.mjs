import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const tempDir = path.join(rootDir, 'scripts', '.tmp-embed-fold-state-test');
const entryPath = path.join(tempDir, 'entry.ts');
const bundlePath = path.join(tempDir, 'bundle.mjs');
const projectImport = (relativePath) => JSON.stringify(path.resolve(rootDir, relativePath).replace(/\\/g, '/'));

const lines = [
	"import assert from 'node:assert/strict';",
	`import { createEmbedOccurrenceKey, EmbedFoldStateService, parsePersistedEmbedFoldState } from ${projectImport('src/services/EmbedFoldStateService.ts')};`,
	`import { createInlineReferenceSummary } from ${projectImport('src/services/InlineReferenceSummary.ts')};`,
	'',
	"const UUID = '11111111-1111-1111-1111-111111111111';",
	"const key = createEmbedOccurrenceKey({ filePath: 'pages/a.md', line: 12, ch: 3, uuid: UUID });",
	"assert.equal(key, JSON.stringify(['pages/a.md', 12, 3, UUID]), 'occurrence keys must be deterministic and location-specific');",
	"assert.notEqual(key, createEmbedOccurrenceKey({ filePath: 'pages/a.md', line: 13, ch: 3, uuid: UUID }), 'separate embed occurrences must not share state');",
	'',
	"assert.deepEqual(parsePersistedEmbedFoldState(null), {}, 'missing state should start fully expanded');",
	"assert.deepEqual(parsePersistedEmbedFoldState({ [key]: ['node-a', 'node-a', '', 7], broken: 'value' }), { [key]: ['node-a'] }, 'persisted state should remove malformed and duplicate node keys');",
	"globalThis.window = globalThis;",
	"const savedStates = [];",
	"const foldStateService = new EmbedFoldStateService({ [key]: ['node-a'] }, async (state) => { savedStates.push(state); });",
	"foldStateService.reconcileOccurrences(new Set());",
	"await new Promise((resolve) => setTimeout(resolve, 220));",
	"assert.deepEqual(savedStates.at(-1), {}, 'states for deleted or changed embed occurrences must be removed');",
	"foldStateService.dispose();",
	'',
	"const longLine = 'This source block first line is intentionally longer than sixty characters so it must remain complete in every inline reference.';",
	"assert.equal(createInlineReferenceSummary(longLine), longLine, 'inline summaries must not truncate long first lines');",
	"assert.equal(createInlineReferenceSummary('## **Visible** [[Target|label]]'), 'Visible label', 'inline summaries should keep the existing Markdown cleanup behavior');",
	"assert.equal(createInlineReferenceSummary('   '), '[empty block]');",
	'',
	"console.log('Embed fold state and inline summary tests passed.');",
];

try {
	await mkdir(tempDir, { recursive: true });
	await writeFile(entryPath, lines.join('\n'), 'utf8');
	await build({
		entryPoints: [entryPath],
		outfile: bundlePath,
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: ['node18'],
	});
	await import(pathToFileURL(bundlePath).href);
} finally {
	await rm(tempDir, { recursive: true, force: true });
}
