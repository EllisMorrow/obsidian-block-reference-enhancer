import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const tempDir = path.join(rootDir, 'scripts', '.tmp-reference-preview-text-test');
const entryPath = path.join(tempDir, 'entry.ts');
const bundlePath = path.join(tempDir, 'bundle.mjs');
const projectImport = (relativePath) => JSON.stringify(path.resolve(rootDir, relativePath).replace(/\\/g, '/'));

const lines = [
	"import assert from 'node:assert/strict';",
	`import { resolveReferencePreviewText } from ${projectImport('src/services/ReferencePreviewText.ts')};`,
	'',
	"const ROOT = '11111111-1111-1111-1111-111111111111';",
	"const CHILD = '22222222-2222-2222-2222-222222222222';",
	"const MISSING = '99999999-9999-9999-9999-999999999999';",
	"const summaries = new Map([[ROOT, `Root ((${CHILD}))`], [CHILD, 'Child summary']]);",
	'const resolver = { resolveSummary: (uuid) => summaries.get(uuid) ?? null };',
	'',
	"assert.equal(resolveReferencePreviewText('plain text', resolver), 'plain text');",
	"assert.equal(resolveReferencePreviewText(`before ((${CHILD})) after`, resolver), 'before Child summary after');",
	"assert.equal(resolveReferencePreviewText(`{{embed ((${ROOT}))}}`, resolver), 'Root Child summary');",
	"assert.equal(resolveReferencePreviewText(`（（${CHILD}）） and ((${CHILD}))`, resolver), 'Child summary and Child summary');",
	"assert.equal(resolveReferencePreviewText(`((${MISSING}))`, resolver), '[Missing block]');",
	'',
	"const CYCLE_A = '33333333-3333-3333-3333-333333333333';",
	"const CYCLE_B = '44444444-4444-4444-4444-444444444444';",
	"const cycleResolver = { resolveSummary: (uuid) => uuid === CYCLE_A ? `((${CYCLE_B}))` : uuid === CYCLE_B ? `((${CYCLE_A}))` : null };",
	"assert.equal(resolveReferencePreviewText(`((${CYCLE_A}))`, cycleResolver), '[Cyclic block]');",
	"assert.equal(resolveReferencePreviewText(`((${ROOT}))`, resolver, { maxDepth: 1 }), 'Root [Reference depth limit]');",
	'',
	"console.log('Reference preview text tests passed.');",
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
