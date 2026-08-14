import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const tempDir = path.join(rootDir, 'scripts', '.tmp-editor-context-menu-target-test');
const entryPath = path.join(tempDir, 'entry.ts');
const bundlePath = path.join(tempDir, 'bundle.mjs');
const projectImport = (relativePath) => JSON.stringify(path.resolve(rootDir, relativePath).replace(/\\/g, '/'));

const lines = [
	"import assert from 'node:assert/strict';",
	`import { registerEditorContextMenuCapture, resolveEditorContextMenuLine } from ${projectImport('src/editor/EditorContextMenuCapturePolicy.ts')};`,
	'',
	'const lineStarts = [0, 6, 12, 18];',
	'const document = {',
	'    length: 23,',
	'    lines: lineStarts.length,',
	'    lineAt(position) {',
	'        for (let index = lineStarts.length - 1; index >= 0; index -= 1) {',
	'            if (position >= lineStarts[index]) return { number: index + 1 };',
	'        }',
	"        throw new RangeError('position outside document');",
	'    },',
	'};',
	'',
	'const domCalls = [];',
	'assert.equal(resolveEditorContextMenuLine(document, [',
	"    () => { domCalls.push('dom'); return 6; },",
	"    () => { domCalls.push('height'); return 12; },",
	"]), 1, 'a direct cm-line/data host must win without consulting geometry');",
	"assert.deepEqual(domCalls, ['dom']);",
	'',
	'const foldMarkerCalls = [];',
	'assert.equal(resolveEditorContextMenuLine(document, [',
	"    () => { foldMarkerCalls.push('dom'); return null; },",
	"    () => { foldMarkerCalls.push('height'); return 12; },",
	"    () => { foldMarkerCalls.push('coords'); return 0; },",
	"]), 2, 'a gutter/fold marker must resolve from its vertical line instead of a misleading cursor-side coordinate');",
	"assert.deepEqual(foldMarkerCalls, ['dom', 'height'], 'a valid height hit must stop before the coordinate fallback');",
	'',
	'assert.equal(resolveEditorContextMenuLine(document, [',
	"    () => { throw new Error('detached marker'); },",
	'    () => Number.NaN,',
	'    () => 18,',
	"]), 3, 'a failed marker strategy must fall through to the remaining geometry strategy');",
	"assert.equal(resolveEditorContextMenuLine(document, [() => -1, () => 24]), null, 'out-of-document positions must never become menu targets');",
	'',
	'const registrations = [];',
	'const removals = [];',
	'const host = {',
	'    addEventListener(type, listener, options) { registrations.push({ type, listener, options }); },',
	'    removeEventListener(type, listener, options) { removals.push({ type, listener, options }); },',
	'};',
	'const eventOrder = [];',
	"const listener = () => eventOrder.push('capture');",
	'const unregister = registerEditorContextMenuCapture(host, listener);',
	"assert.equal(registrations.length, 1, 'exactly one native contextmenu listener should be installed');",
	"assert.equal(registrations[0].type, 'contextmenu');",
	"assert.equal(registrations[0].options, true, 'the listener must run in capture phase before CodeMirror ignoreEvent filtering');",
	'registrations[0].listener({ type: \'contextmenu\' });',
	"eventOrder.push('editor-menu');",
	"assert.deepEqual(eventOrder, ['capture', 'editor-menu'], 'the target must be recorded before the menu consumes it');",
	'unregister();',
	"assert.deepEqual(removals, registrations, 'destroy must remove the same capture listener without leaking an EditorView');",
	'',
	"console.log('Editor context-menu target tests passed.');",
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
