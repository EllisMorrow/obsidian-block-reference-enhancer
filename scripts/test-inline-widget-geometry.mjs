import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const tempDir = path.join(rootDir, 'scripts', '.tmp-inline-widget-geometry-test');
const entryPath = path.join(tempDir, 'entry.ts');
const bundlePath = path.join(tempDir, 'bundle.mjs');
const projectImport = (relativePath) => JSON.stringify(path.resolve(rootDir, relativePath).replace(/\\/g, '/'));

const lines = [
    "import assert from 'node:assert/strict';",
    `import { calculateInlineAvailableWidth, createInlineHorizontalGeometryKey } from ${projectImport('src/editor/InlineWidgetGeometry.ts')};`,
    '',
    'const measure = (overrides = {}) => calculateInlineAvailableWidth({',
    '    contentLeftPx: 100,',
    '    contentRightPx: 1100,',
    '    lineLeftPx: 100,',
    '    lineRightPx: 1100,',
    '    anchorLeftPx: 300,',
    '    safetyPx: 16,',
    '    ...overrides,',
    '});',
    '',
    "assert.equal(measure(), 784, 'default-theme geometry should keep the existing content boundary');",
    "assert.equal(measure({ lineLeftPx: 250, lineRightPx: 850, anchorLeftPx: 350 }), 484, 'a centered narrow theme line must cap the available width');",
    "assert.equal(measure({ contentRightPx: 800, lineRightPx: 1000, anchorLeftPx: 300 }), 484, 'the editor boundary must cap a line that extends beyond the content area');",
    "assert.equal(measure({ anchorLeftPx: 90 }), null, 'anchors outside the actual line must not produce fallback page-width geometry');",
    "assert.equal(measure({ anchorLeftPx: 1090 }), null, 'non-positive remaining width must be rejected');",
    "assert.equal(measure({ lineRightPx: Number.NaN }), null, 'invalid measurements must be rejected');",
    '',
    'const geometryKeyInput = {',
    '    contentLeftPx: 100,',
    '    contentRightPx: 1100,',
    '    lineLeftPx: 250,',
    '    lineRightPx: 850,',
    "    fontFamily: 'Test',",
    "    fontSize: '16px',",
    "    lineHeight: '24px',",
    "    listIndent: '2em',",
    "    fileLineWidth: '700px',",
    '};',
    'const geometryKey = createInlineHorizontalGeometryKey(geometryKeyInput);',
    "assert.equal(createInlineHorizontalGeometryKey({ ...geometryKeyInput, contentRightPx: 1101 }), geometryKey, 'sub-quantum geometry noise should keep caches valid');",
    "assert.notEqual(createInlineHorizontalGeometryKey({ ...geometryKeyInput, contentRightPx: 1092 }), geometryKey, 'editor width changes must invalidate cached widths');",
    "assert.notEqual(createInlineHorizontalGeometryKey({ ...geometryKeyInput, lineRightPx: 800 }), geometryKey, 'theme line-width changes must invalidate cached widths');",
    "assert.notEqual(createInlineHorizontalGeometryKey({ ...geometryKeyInput, listIndent: '3em' }), geometryKey, 'list indentation changes must invalidate cached widths');",
    '',
    "console.log('Inline widget geometry tests passed.');",
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
