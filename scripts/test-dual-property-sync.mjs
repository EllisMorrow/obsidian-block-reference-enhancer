import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const tempDir = path.join(rootDir, 'scripts', '.tmp-dual-property-sync-test');
const entryPath = path.join(tempDir, 'entry.ts');
const bundlePath = path.join(tempDir, 'bundle.cjs');
const projectImport = (relativePath) => JSON.stringify(path.resolve(rootDir, relativePath).replace(/\\/g, '/'));

const lines = [
	"import assert from 'node:assert/strict';",
	`import { analyzeDualPropertyDocument, removeFrontmatter, repairBulletizedYaml, updateDualPropertyDocument } from ${projectImport('src/dual-property-sync/document.ts')};`,
	`import { buildDualPropertySyncPlan, createDualPropertySnapshot, materializeDualPropertySyncPlan } from ${projectImport('src/dual-property-sync/reconcile.ts')};`,
	`import { parseDualPropertyRules } from ${projectImport('src/dual-property-sync/rules.ts')};`,
	'',
	"const parsedRules = parseDualPropertyRules('alias::<->aliases\\ntags');",
	"assert.deepEqual(parsedRules.errors, []);",
	"assert.equal(parsedRules.normalizedText, 'alias<->aliases\\ntags');",
	"assert.equal(parsedRules.rules[0].codec, 'aliases');",
	"assert.match(parseDualPropertyRules('id').errors[0], /protected/);",
	"assert.match(parseDualPropertyRules('a<->x\\nb<->x').errors[0], /already mapped/);",
	"assert.match(parseDualPropertyRules('bad[key').errors[0], /cannot contain/);",
	"assert.match(parseDualPropertyRules('bad]key').errors[0], /cannot contain/);",
	'',
	'{',
	"  const content = ['---', '# keep this comment', 'aliases:', '  - A', 'custom: keep', '---', '', 'alias:: A', 'other:: untouched', '', '- body', '  id:: block-only'].join('\\n');",
	'  const analysis = analyzeDualPropertyDocument(content, parsedRules.rules);',
	"  assert.deepEqual(analysis.yaml.values['alias<->aliases'], ['A']);",
	"  assert.deepEqual(analysis.logseq.values['alias<->aliases'], ['A']);",
	"  assert.equal(analysis.logseq.values['tags<->tags'], null);",
	"  assert.equal(analysis.hasUnmanagedYaml, true);",
	"  const update = updateDualPropertyDocument(content, parsedRules.rules, { 'alias<->aliases': ['A', 'B'], 'tags<->tags': ['topic'] });",
	"  assert.deepEqual(update.errors, []);",
	"  assert.match(update.content, /# keep this comment/);",
	"  assert.match(update.content, /custom: keep/);",
	"  assert.match(update.content, /aliases:\\n  - A\\n  - B/);",
	"  assert.match(update.content, /alias:: A, B/);",
	"  assert.match(update.content, /tags:: topic/);",
	"  assert.match(update.content, /other:: untouched/);",
	"  assert.match(update.content, /  id:: block-only/);",
	'}',
	'',
	'{',
	"  const content = '- body\\n  alias:: block-value';",
	'  const analysis = analyzeDualPropertyDocument(content, parsedRules.rules);',
	"  assert.equal(analysis.logseq.values['alias<->aliases'], null, 'indented block properties must not be treated as page properties');",
	'}',
	'',
	'{',
	"  const content = 'alias:: A\\n\\n- body';",
	"  const update = updateDualPropertyDocument(content, parsedRules.rules, { 'alias<->aliases': ['A'], 'tags<->tags': null });",
	"  assert.equal(update.content, ['---', 'aliases:', '  - A', '---', '', 'alias:: A', '', '- body'].join('\\n'));",
	'}',
	'',
	'{',
	"  const content = ['---', 'aliases:', '  - A', '---', '', '- body'].join('\\n');",
	"  const update = updateDualPropertyDocument(content, parsedRules.rules, { 'alias<->aliases': ['A'], 'tags<->tags': null });",
	"  assert.equal(update.content, ['---', 'aliases:', '  - A', '---', '', 'alias:: A', '', '- body'].join('\\n'), 'adding Logseq properties must not introduce duplicate blank separators');",
	'}',
	'',
	'{',
	"  const content = ['---', 'aliases:', '  - A, B', '---', 'alias:: A, B'].join('\\n');",
	'  const analysis = analyzeDualPropertyDocument(content, parsedRules.rules);',
	"  assert.match(analysis.errors[0], /cannot be represented safely/, 'lossy alias lists must be rejected instead of rewritten');",
	'}',
	'',
	'{',
	"  const initial = ['---', 'aliases:', '  - A', '---', 'alias:: A', '', '- body'].join('\\n');",
	'  const snapshot = createDualPropertySnapshot({ content: initial, rules: parsedRules.rules, rulesFingerprint: parsedRules.fingerprint, now: 1 });',
	"  const yamlDeleted = ['---', '{}', '---', 'alias:: A', '', '- body'].join('\\n');",
	'  const plan = buildDualPropertySyncPlan({ filePath: \'test.md\', content: yamlDeleted, rules: parsedRules.rules, rulesFingerprint: parsedRules.fingerprint, snapshot, allowRepair: false });',
	"  assert.equal(plan.conflictRuleIds.length, 0);",
	'  const final = materializeDualPropertySyncPlan(plan, parsedRules.rules);',
	"  assert.ok(!final.content.includes('alias::'), 'deleting the YAML side after a baseline should propagate the deletion');",
	'}',
	'',
	'{',
	"  const conflicting = ['---', 'aliases:', '  - YAML', '---', 'alias:: Logseq', '', '- body'].join('\\n');",
	'  const plan = buildDualPropertySyncPlan({ filePath: \'conflict.md\', content: conflicting, rules: parsedRules.rules, rulesFingerprint: parsedRules.fingerprint, allowRepair: false });',
	"  assert.deepEqual(plan.conflictRuleIds, ['alias<->aliases']);",
	'}',
	'',
	'{',
	"  const broken = ['- ---', '  aliases:', '    - A', '  ---', '  alias:: A', '- body'].join('\\n');",
	'  const repair = repairBulletizedYaml(broken, parsedRules.rules);',
	"  assert.equal(repair.status, 'safe');",
	"  assert.equal(repair.content, ['---', 'aliases:', '  - A', '---', 'alias:: A', '- body'].join('\\n'));",
	"  const unrelated = ['- ---', '  random: value', '  ---', '- body'].join('\\n');",
	"  assert.equal(repairBulletizedYaml(unrelated, parsedRules.rules).status, 'unsafe');",
	'}',
	'',
	'{',
	"  const content = ['---', 'aliases:', '  - A', '---', 'alias:: A', '', '- body'].join('\\r\\n');",
	'  const removed = removeFrontmatter(content);',
	"  assert.equal(removed.content, ['alias:: A', '', '- body'].join('\\r\\n'));",
	"  assert.ok(!removed.content.includes('\\n') || removed.content.includes('\\r\\n'));",
	'}',
	'',
	"console.log('Dual property sync tests passed.');",
];

try {
	await mkdir(tempDir, { recursive: true });
	await writeFile(entryPath, lines.join('\n'), 'utf8');
	await build({
		entryPoints: [entryPath],
		outfile: bundlePath,
		bundle: true,
		format: 'cjs',
		platform: 'node',
		target: ['node18'],
	});
	await import(pathToFileURL(bundlePath).href);
} finally {
	await rm(tempDir, { recursive: true, force: true });
}
