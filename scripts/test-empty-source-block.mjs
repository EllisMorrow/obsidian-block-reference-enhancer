import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const tempDir = path.join(rootDir, 'scripts', '.tmp-empty-source-block-test');
const entryPath = path.join(tempDir, 'entry.ts');
const bundlePath = path.join(tempDir, 'bundle.mjs');

const projectImport = (relativePath) => JSON.stringify(path.resolve(rootDir, relativePath).replace(/\\/g, '/'));

const lines = [
  "import assert from 'node:assert/strict';",
  `import { BlockParser } from ${projectImport('src/services/BlockParser.ts')};`,
  `import { createInlineReferenceSummary } from ${projectImport('src/services/InlineReferenceSummary.ts')};`,
  `import { initializeI18n } from ${projectImport('src/i18n/index.ts')};`,
  `import { buildSourceBlockIdInsertion, parseSourceBlockLine } from ${projectImport('src/utils/sourceBlockLine.ts')};`,
  '',
  "const emptyUuid = '699c3044-2c70-4199-9115-de5460941dd5';",
  "const parentUuid = '97d1b5e4-e6a7-4d4f-a5a7-2b78d54829a8';",
  "const childUuid = 'f8595241-1bd5-4207-89c7-97091fc49aea';",
  '',
  '{',
  '  const doc = [',
  "    '- 笔记提示',",
  "    '\\t- ',",
  "    '\\t  id:: ' + emptyUuid,",
  "    '\\t  > 我的交易更像是研究“追求实证的量能对比与概率科学家”',",
  "    '- ((' + emptyUuid + '))',",
  "  ].join('\\n');",
  "  const parsed = new BlockParser().parse('empty-source.md', doc);",
  '  const block = parsed.blocks.get(emptyUuid);',
  "  assert.ok(block, 'empty list item with an id should be indexed');",
  "  assert.equal(block.startLine, 1, 'source location should stay on the empty child item');",
  "  assert.equal(block.rawContent.split(/\\r?\\n/, 1)[0], '', 'continuation text must not become the empty block title');",
  "  assert.match(block.rawContent, /我的交易/, 'continuation content should remain available to embeds');",
  "  assert.equal(parsed.referencesById.get(emptyUuid)?.length ?? 0, 1, 'reference should still be indexed');",
  '}',
  '',
  '{',
  '  const doc = [',
  "    '- 1',",
  "    '  id:: ' + parentUuid,",
  "    '\\t- ',",
  "    '\\t  id:: ' + childUuid,",
  "    '\\t\\t- 3',",
  "    '\\t- ',",
  "  ].join('\\n');",
  "  const parsed = new BlockParser().parse('nested-empty-source.md', doc);",
  '  const parent = parsed.blocks.get(parentUuid);',
  '  const child = parsed.blocks.get(childUuid);',
  "  assert.ok(parent, 'parent source should remain indexed');",
  "  assert.ok(child, 'empty child source should be indexed separately');",
  "  assert.equal(parent.startLine, 0, 'parent id must remain attached to the parent');",
  "  assert.equal(child.startLine, 2, 'child id must attach to the empty child marker');",
  "  assert.equal(child.rawContent.split(/\\r?\\n/, 1)[0], '', 'empty child title should remain empty');",
  "  assert.match(child.childrenMarkdown, /- 3/, 'empty child should retain its nested list content');",
  "  assert.deepEqual(parent.childrenIDs, [childUuid], 'parent should reference the actual child source id');",
  '}',
  '',
  '{',
  '  const doc = [',
  "    '- legacy',",
  "    '    id:: ' + emptyUuid,",
  "  ].join('\\n');",
  "  const block = new BlockParser().parse('legacy-indent.md', doc).blocks.get(emptyUuid);",
  "  assert.ok(block, 'legacy four-space property indentation should remain supported');",
  '}',
  '',
  '{',
  "  assert.deepEqual(parseSourceBlockLine('-'), { leadingWhitespace: '', content: '' });",
  "  assert.deepEqual(parseSourceBlockLine('- '), { leadingWhitespace: '', content: '' });",
  "  assert.deepEqual(parseSourceBlockLine('\\t- text'), { leadingWhitespace: '\\t', content: 'text' });",
  "  assert.equal(parseSourceBlockLine('---'), null, 'horizontal rules must not become source blocks');",
  "  assert.equal(parseSourceBlockLine('- - -'), null, 'spaced horizontal rules must not become source blocks');",
  "  assert.equal(buildSourceBlockIdInsertion('- root', emptyUuid), '\\n  id:: ' + emptyUuid);",
  "  assert.equal(buildSourceBlockIdInsertion('\\t- child', emptyUuid), '\\n\\t  id:: ' + emptyUuid);",
  '}',
  '',
  '{',
  "  initializeI18n('en');",
  "  assert.equal(createInlineReferenceSummary(''), '[Empty source block]');",
  "  initializeI18n('zh-CN');",
  "  assert.equal(createInlineReferenceSummary(''), '[块源为空]');",
  '}',
  '',
  "console.log('Empty source block tests passed.');",
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
