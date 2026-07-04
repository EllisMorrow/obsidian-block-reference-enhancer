import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const tempDir = path.join(rootDir, 'scripts', '.tmp-i18n-test');
const entryPath = path.join(tempDir, 'entry.ts');
const bundlePath = path.join(tempDir, 'bundle.mjs');
const projectImport = (relativePath) => JSON.stringify(path.resolve(rootDir, relativePath).replace(/\\/g, '/'));

const lines = [
	"import assert from 'node:assert/strict';",
	`import { EN_MESSAGES, ZH_CN_MESSAGES, getActiveLocale, initializeI18n, resolveSupportedLocale, t } from ${projectImport('src/i18n/index.ts')};`,
	'',
	'const englishKeys = Object.keys(EN_MESSAGES).sort();',
	'const chineseKeys = Object.keys(ZH_CN_MESSAGES).sort();',
	"assert.deepEqual(chineseKeys, englishKeys, 'English and Chinese dictionaries must contain the same keys');",
	'',
	"const placeholders = (value) => [...value.matchAll(/\\{([A-Za-z0-9_]+)\\}/gu)].map((match) => match[1]).sort();",
	'for (const key of englishKeys) {',
	"\tassert.deepEqual(placeholders(ZH_CN_MESSAGES[key]), placeholders(EN_MESSAGES[key]), `placeholder mismatch for ${key}`);",
	'}',
	'',
	"assert.equal(resolveSupportedLocale('en'), 'en');",
	"assert.equal(resolveSupportedLocale('en-GB'), 'en');",
	"assert.equal(resolveSupportedLocale('fr'), 'en');",
	"assert.equal(resolveSupportedLocale(undefined), 'en');",
	"assert.equal(resolveSupportedLocale('zh'), 'zh-cn');",
	"assert.equal(resolveSupportedLocale('zh-CN'), 'zh-cn');",
	"assert.equal(resolveSupportedLocale('zh-TW'), 'zh-cn');",
	"assert.equal(resolveSupportedLocale('zh-HK'), 'zh-cn');",
	'',
	"assert.equal(initializeI18n('zh-TW'), 'zh-cn');",
	"assert.equal(getActiveLocale(), 'zh-cn');",
	"assert.equal(t('action.back'), '返回');",
	"assert.equal(t('aria.referencedTimes', { count: 3 }), '被引用 3 次');",
	"assert.equal(initializeI18n('de-DE'), 'en');",
	"assert.equal(t('action.back'), 'Back');",
	'',
	"console.log('i18n tests passed.');",
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
