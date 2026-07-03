import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const tempDir = path.join(rootDir, 'scripts', '.tmp-embedded-property-filter-test');
const entryPath = path.join(tempDir, 'entry.ts');
const bundlePath = path.join(tempDir, 'bundle.mjs');
const projectImport = (relativePath) => JSON.stringify(path.resolve(rootDir, relativePath).replace(/\\/g, '/'));

const lines = [
	"import assert from 'node:assert/strict';",
	`import { filterHiddenLogseqPropertyLinesForEmbed } from ${projectImport('src/services/LogseqPropertyMatcher.ts')};`,
	'',
	"const matcher = { exactKeys: new Set(['collapsed', 'id']), prefixKeys: ['hl-'], rules: ['collapsed', 'id', 'hl-*'] };",
	'',
	'{',
	"  const markdown = ['Codex 配额', '  collapsed:: true', '  visible note'].join('\\n');",
	"  assert.equal(filterHiddenLogseqPropertyLinesForEmbed(markdown, matcher, true), ['Codex 配额', '  visible note'].join('\\n'), 'root block continuation properties should be hidden');",
	'}',
	'',
	'{',
	"  const markdown = ['- Parent', '  collapsed:: true', '  visible note', '  - Child', '    hl-page:: 3', '    keep:: yes'].join('\\n');",
	"  const expected = ['- Parent', '  visible note', '  - Child', '    keep:: yes'].join('\\n');",
	"  assert.equal(filterHiddenLogseqPropertyLinesForEmbed(markdown, matcher, false), expected, 'nested outline properties should be filtered without removing ordinary continuation lines');",
	'}',
	'',
	'{',
	"  const markdown = ['- Parent', '  ```yaml', '  collapsed:: true', '  ```', '  - Child'].join('\\n');",
	"  assert.equal(filterHiddenLogseqPropertyLinesForEmbed(markdown, matcher, false), markdown, 'property-like text inside fenced code must remain visible');",
	'}',
	'',
	'{',
	"  const markdown = 'collapsed:: true';",
	"  assert.equal(filterHiddenLogseqPropertyLinesForEmbed(markdown, matcher, false), markdown, 'page-level property text without an outline owner must not be removed');",
	"  assert.equal(filterHiddenLogseqPropertyLinesForEmbed(markdown, matcher, true), markdown, 'a root block whose actual content looks like a property must remain visible');",
	'}',
	'',
	"console.log('Embedded Logseq property filter tests passed.');",
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
