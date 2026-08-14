import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const tempDir = path.join(rootDir, 'scripts', '.tmp-block-image-extraction-test');
const entryPath = path.join(tempDir, 'entry.ts');
const bundlePath = path.join(tempDir, 'bundle.mjs');
const projectImport = (relativePath) => JSON.stringify(path.resolve(rootDir, relativePath).replace(/\\/g, '/'));

const lines = [
	"import assert from 'node:assert/strict';",
	`import { extractBlockFirstLineImage, extractBlockFirstLineImages, prepareBlockEmbedMarkdownImages, stripLogseqImageSizeAttributes } from ${projectImport('src/services/BlockImageExtraction.ts')};`,
	`import { calculateBlockReferenceImageFrame } from ${projectImport('src/ui/BlockReferenceImageElement.ts')};`,
	`import { composeNestedInlineReferenceSegments, replaceNestedBlockReferencesWithText } from ${projectImport('src/services/NestedInlineReferenceSegments.ts')};`,
	`import { createInlineReferencePlainText } from ${projectImport('src/services/InlineReferenceSummary.ts')};`,
	'',
	"assert.deepEqual(extractBlockFirstLineImage('![](../assets/x.png)'), { image: { src: '../assets/x.png', alt: '' }, summaryMarkdown: '' });",
	"assert.deepEqual(extractBlockFirstLineImage('Before ![240](../assets/x.png) after'), { image: { src: '../assets/x.png', alt: '', width: 240 }, summaryMarkdown: 'Before  after' });",
	"assert.deepEqual(extractBlockFirstLineImage('![](../assets/x.png){:height 120, :width 240} caption'), { image: { src: '../assets/x.png', alt: '', width: 240, height: 120 }, summaryMarkdown: ' caption' });",
	"assert.deepEqual(extractBlockFirstLineImage('![](../assets/x.png){:width 240 height 120}'), { image: { src: '../assets/x.png', alt: '', width: 240, height: 120 }, summaryMarkdown: '' });",
	"assert.deepEqual(extractBlockFirstLineImage('![](../assets/x.png){:width 240, :height 120 }'), { image: { src: '../assets/x.png', alt: '', width: 240, height: 120 }, summaryMarkdown: '' }, 'trailing attribute whitespace must be accepted');",
	"assert.deepEqual(extractBlockFirstLineImage('![Description](../assets/x.png){:width 99999}'), { image: { src: '../assets/x.png', alt: 'Description' }, summaryMarkdown: '' }, 'out-of-range dimensions must not reach the renderer');",
	"assert.deepEqual(extractBlockFirstLineImage('ordinary [label](../assets/x.png){:width 240}'), { image: null, summaryMarkdown: 'ordinary [label](../assets/x.png){:width 240}' }, 'ordinary Markdown must remain unchanged');",
	"assert.deepEqual(extractBlockFirstLineImage('Example: `![](https://example.com/tracker.png)`'), { image: null, summaryMarkdown: 'Example: `![](https://example.com/tracker.png)`' }, 'images inside inline code must never render or fetch');",
	"assert.deepEqual(extractBlockFirstLineImage('\\\\![](https://example.com/tracker.png)'), { image: null, summaryMarkdown: '\\\\![](https://example.com/tracker.png)' }, 'escaped image syntax must remain literal');",
	"assert.deepEqual(extractBlockFirstLineImage('<!-- ![](https://example.com/tracker.png) -->'), { image: null, summaryMarkdown: '<!-- ![](https://example.com/tracker.png) -->' }, 'images inside HTML comments must never render or fetch');",
	"assert.deepEqual(extractBlockFirstLineImage('%% ![](https://example.com/tracker.png) %%'), { image: null, summaryMarkdown: '%% ![](https://example.com/tracker.png) %%' }, 'images inside Obsidian comments must never render or fetch');",
	"assert.deepEqual(extractBlockFirstLineImage('%% hidden %% ![](visible.png)'), { image: { src: 'visible.png', alt: '' }, summaryMarkdown: '%% hidden %% ' }, 'images after a closed Obsidian comment must still render');",
	"assert.deepEqual(extractBlockFirstLineImage('<code>![](https://example.com/tracker.png)</code>'), { image: null, summaryMarkdown: '<code>![](https://example.com/tracker.png)</code>' }, 'images inside HTML code must remain literal');",
	"assert.deepEqual(extractBlockFirstLineImage('<span data-example=\"![](https://example.com/tracker.png)\">text</span>'), { image: null, summaryMarkdown: '<span data-example=\"![](https://example.com/tracker.png)\">text</span>' }, 'image-like text inside HTML attributes must never fetch');",
	"assert.deepEqual(extractBlockFirstLineImage('<span title=\"a > ![](https://example.com/tracker.png)\">text</span>'), { image: null, summaryMarkdown: '<span title=\"a > ![](https://example.com/tracker.png)\">text</span>' }, 'a greater-than sign inside a quoted HTML attribute must not escape the tag context');",
	"assert.deepEqual(extractBlockFirstLineImage('[link](https://example.com \"demo ![](https://tracker.example/x.png)\")'), { image: null, summaryMarkdown: '[link](https://example.com \"demo ![](https://tracker.example/x.png)\")' }, 'image-like text inside a Markdown link title must never fetch');",
	"assert.deepEqual(extractBlockFirstLineImage('[link](https://example.com) ![](visible.png)'), { image: { src: 'visible.png', alt: '' }, summaryMarkdown: '[link](https://example.com) ' }, 'an image after a closed Markdown link must still render');",
	"assert.deepEqual(extractBlockFirstLineImage('`![](hidden.png)` then ![](visible.png)'), { image: { src: 'visible.png', alt: '' }, summaryMarkdown: '`![](hidden.png)` then ' }, 'the first eligible image after code must still render');",
	"assert.deepEqual(extractBlockFirstLineImage('![](../assets/x.png){:width 240, class photo}'), { image: { src: '../assets/x.png', alt: '' }, summaryMarkdown: '{:width 240, class photo}' }, 'unrecognized attributes must not be consumed');",
	"assert.deepEqual(extractBlockFirstLineImage('![](../assets/one.png) and ![](../assets/two.png)'), { image: { src: '../assets/one.png', alt: '' }, summaryMarkdown: ' and ![](../assets/two.png)' }, 'only the first image may be extracted');",
	"assert.deepEqual(extractBlockFirstLineImages('    ![](https://example.com/tracker.png)'), { segments: [{ type: 'text', markdown: '    ![](https://example.com/tracker.png)' }], images: [], summaryMarkdown: '    ![](https://example.com/tracker.png)' }, 'indented Markdown code must never render or fetch an image');",
	"assert.deepEqual(extractBlockFirstLineImages('\t![](https://example.com/tracker.png)'), { segments: [{ type: 'text', markdown: '\t![](https://example.com/tracker.png)' }], images: [], summaryMarkdown: '\t![](https://example.com/tracker.png)' }, 'tab-indented Markdown code must never render or fetch an image');",
	"assert.deepEqual(extractBlockFirstLineImages('~~~ ![](https://example.com/tracker.png)'), { segments: [{ type: 'text', markdown: '~~~ ![](https://example.com/tracker.png)' }], images: [], summaryMarkdown: '~~~ ![](https://example.com/tracker.png)' }, 'a fenced-code opener must never render or fetch an image');",
	"assert.equal(extractBlockFirstLineImages('    - ![x](x.png){:width 32}', { protectMarkdownCodeLine: false }).images[0]?.width, 32, 'full-embed parsing must retain deeply nested list images after the caller handles fence state');",
	"assert.deepEqual(extractBlockFirstLineImages('文字 ![one.png](../assets/one.png){:height 44, :width 39} 中间 ![two.png](../assets/two.png){:height 39, :width 32} 结尾'), { segments: [{ type: 'text', markdown: '文字 ' }, { type: 'image', markdown: '![one.png](../assets/one.png)', image: { src: '../assets/one.png', alt: 'one.png', width: 39, height: 44 } }, { type: 'text', markdown: ' 中间 ' }, { type: 'image', markdown: '![two.png](../assets/two.png)', image: { src: '../assets/two.png', alt: 'two.png', width: 32, height: 39 } }, { type: 'text', markdown: ' 结尾' }], images: [{ src: '../assets/one.png', alt: 'one.png', width: 39, height: 44 }, { src: '../assets/two.png', alt: 'two.png', width: 32, height: 39 }], summaryMarkdown: '文字  中间  结尾' }, 'mixed text and multiple images must preserve exact source order');",
	"assert.deepEqual(extractBlockFirstLineImages('![image.png|359](../assets/x.png)'), { segments: [{ type: 'image', markdown: '![image.png|359](../assets/x.png)', image: { src: '../assets/x.png', alt: 'image.png', width: 359 } }], images: [{ src: '../assets/x.png', alt: 'image.png', width: 359 }], summaryMarkdown: '' }, 'Image Converter alt suffix must become a width hint without polluting the real alt text');",
	"assert.deepEqual(extractBlockFirstLineImages('![image.png|359](../assets/x.png){:height 39, :width 32}'), { segments: [{ type: 'image', markdown: '![image.png|359](../assets/x.png)', image: { src: '../assets/x.png', alt: 'image.png', width: 32, height: 39 } }], images: [{ src: '../assets/x.png', alt: 'image.png', width: 32, height: 39 }], summaryMarkdown: '' }, 'adjacent Logseq dimensions must override the Image Converter width');",
	"assert.deepEqual(extractBlockFirstLineImages('plain **Markdown**'), { segments: [{ type: 'text', markdown: 'plain **Markdown**' }], images: [], summaryMarkdown: 'plain **Markdown**' }, 'image-free text must remain byte-for-byte compatible');",
	"assert.deepEqual(extractBlockFirstLineImages('![image.png|99999](x.png){:width 0, :height nope} tail'), { segments: [{ type: 'image', markdown: '![image.png|99999](x.png)', image: { src: 'x.png', alt: 'image.png|99999' } }, { type: 'text', markdown: ' tail' }], images: [{ src: 'x.png', alt: 'image.png|99999' }], summaryMarkdown: ' tail' }, 'invalid dimensions must not reach layout while recognized size syntax remains consumed');",
	"assert.deepEqual(extractBlockFirstLineImages('![x](x.png){:width 10, class photo} ![y](y.png)'), { segments: [{ type: 'image', markdown: '![x](x.png)', image: { src: 'x.png', alt: 'x' } }, { type: 'text', markdown: '{:width 10, class photo} ' }, { type: 'image', markdown: '![y](y.png)', image: { src: 'y.png', alt: 'y' } }], images: [{ src: 'x.png', alt: 'x' }, { src: 'y.png', alt: 'y' }], summaryMarkdown: '{:width 10, class photo} ' }, 'unknown attribute lists must stay in their original text position');",
	"assert.deepEqual(extractBlockFirstLineImages('`![](code.png)` %% ![](comment.png) %% <!-- ![](html-comment.png) --> <span data-x=\"![](attribute.png)\">x</span> [link](dest \"![](title.png)\") ![](visible.png)'), { segments: [{ type: 'text', markdown: '`![](code.png)` %% ![](comment.png) %% <!-- ![](html-comment.png) --> <span data-x=\"![](attribute.png)\">x</span> [link](dest \"![](title.png)\") ' }, { type: 'image', markdown: '![](visible.png)', image: { src: 'visible.png', alt: '' } }], images: [{ src: 'visible.png', alt: '' }], summaryMarkdown: '`![](code.png)` %% ![](comment.png) %% <!-- ![](html-comment.png) --> <span data-x=\"![](attribute.png)\">x</span> [link](dest \"![](title.png)\") ' }, 'protected pseudo-images must remain literal while a later visible image renders');",
	"assert.deepEqual(extractBlockFirstLineImages('\\\\![](escaped.png) <pre>![](raw.png)</pre> ![](visible.png)'), { segments: [{ type: 'text', markdown: '\\\\![](escaped.png) <pre>![](raw.png)</pre> ' }, { type: 'image', markdown: '![](visible.png)', image: { src: 'visible.png', alt: '' } }], images: [{ src: 'visible.png', alt: '' }], summaryMarkdown: '\\\\![](escaped.png) <pre>![](raw.png)</pre> ' }, 'escaped and raw-text pseudo-images must never become image segments');",
	"assert.equal(stripLogseqImageSizeAttributes('文字 ![x](x.png){:height 44, :width 39} ![y](y.png){:width 10, class photo}'), '文字 ![x](x.png) ![y](y.png){:width 10, class photo}', 'full-embed Markdown must retain images while hiding only valid Logseq size suffixes');",
	"assert.equal(stripLogseqImageSizeAttributes('`![](code.png){:width 1}` %% ![](comment.png){:width 2} %% [link](dest \"![](title.png){:width 3}\") ![](visible.png){:width 4}'), '`![](code.png){:width 1}` %% ![](comment.png){:width 2} %% [link](dest \"![](title.png){:width 3}\") ![](visible.png)', 'suffix stripping must not alter code, comments, or Markdown link titles');",
	"const protectedEmbed = prepareBlockEmbedMarkdownImages(['    ![](same.png){:width 10}', '```', '![](same.png){:width 15}', '```', '<!--', '![](same.png){:width 20}', '-->', '%%', '![](same.png){:width 30}', '%%', '<pre>', '![](same.png){:width 40}', '</pre>', '![](same.png){:width 200}'].join('\\n'));",
	"assert.equal(protectedEmbed.images.length, 1, 'code and cross-line hidden regions must not contribute native-image size records');",
	"assert.deepEqual(protectedEmbed.images[0], { image: { src: 'same.png', alt: '', width: 200 }, renderedAlt: '' }, 'a hidden same-src pseudo-image must never steal the real image size');",
	"assert.match(protectedEmbed.markdown, / {4}!\\[\\]\\(same\\.png\\)\\{:width 10\\}/, 'indented code must stay byte-for-byte visible');",
	"assert.match(protectedEmbed.markdown, /<pre>\\n!\\[\\]\\(same\\.png\\)\\{:width 40\\}\\n<\\/pre>/, 'raw HTML text must retain image-like code and its suffix');",
	"assert.ok(protectedEmbed.markdown.endsWith('![](same.png)'), 'only the real image Logseq suffix should be removed');",
	"const nestedListEmbed = prepareBlockEmbedMarkdownImages('- root\\n    - ![image.png|359](nested.png){:height 39, :width 32}');",
	"assert.deepEqual(nestedListEmbed.images[0], { image: { src: 'nested.png', alt: 'image.png', width: 32, height: 39 }, renderedAlt: 'image.png|359' }, 'deep list indentation must not be mistaken for an indented code block');",
	"const resumedAfterComment = prepareBlockEmbedMarkdownImages(['%%', 'hidden', '%% ![](visible.png){:width 200}'].join('\\n'));",
	"assert.deepEqual(resumedAfterComment.images[0], { image: { src: 'visible.png', alt: '', width: 200 }, renderedAlt: '' }, 'a real image after a cross-line comment closes on the same line must still receive its size');",
	"assert.ok(resumedAfterComment.markdown.endsWith('%% ![](visible.png)'), 'the visible image suffix after a closing comment must be removed');",
	"const INNER_UUID = '11111111-1111-4111-8111-111111111111';",
	"const innerSource = extractBlockFirstLineImages('inner before ![nested.png|359](../assets/nested.png){:height 39, :width 32} inner after');",
	"const innerResolvedSegments = composeNestedInlineReferenceSegments(innerSource.segments, { missingReferenceText: '[Missing block]', renderText: createInlineReferencePlainText, resolveImage: (image) => { assert.equal(image.src, '../assets/nested.png'); return { ...image, src: 'app://inner/assets/nested.png' }; }, resolveNestedReference: () => ({ text: null }) });",
	"const nestedImageInfo = { text: 'inner fallback', segments: innerResolvedSegments };",
	"let nestedResolveCount = 0;",
	"let outerImageResolveCount = 0;",
	"const composeNested = (markdown) => composeNestedInlineReferenceSegments(extractBlockFirstLineImages(markdown).segments, { missingReferenceText: '[Missing block]', renderText: createInlineReferencePlainText, resolveImage: (image) => { outerImageResolveCount += 1; return { ...image, src: `app://outer/${image.src}` }; }, resolveNestedReference: (uuid) => { assert.equal(uuid, INNER_UUID); nestedResolveCount += 1; return nestedImageInfo; } });",
	"assert.deepEqual(composeNested(`outer before ((${INNER_UUID})) outer after`), [{ type: 'text', text: 'outer before' }, { type: 'text', text: 'inner before' }, { type: 'image', image: { src: 'app://inner/assets/nested.png', alt: 'nested.png', width: 32, height: 39 } }, { type: 'text', text: 'inner after' }, { type: 'text', text: 'outer after' }], 'nested inline image segments must keep text-image-text order and the nested block resource path');",
	"assert.deepEqual(composeNested(`{{embed ((${INNER_UUID}))}}`), nestedImageInfo.segments, 'an inline outer reference whose title is a nested embed must replace the entire wrapper with the inner image segments');",
	"assert.equal(outerImageResolveCount, 0, 'a nested local image must stay resolved relative to the nested block instead of being re-resolved against the outer file');",
	"assert.equal(replaceNestedBlockReferencesWithText(`before {{embed ((${INNER_UUID}))}} after`, () => 'inner', '[Missing block]'), 'before inner after', 'nested embed text fallback must not leave wrapper braces');",
	"const resolvedBeforeProtectedCases = nestedResolveCount;",
	"for (const protectedMarkdown of [`\\\\((${INNER_UUID}))`, '`' + `((${INNER_UUID}))` + '`', `%% ((${INNER_UUID})) %%`, `<!-- ((${INNER_UUID})) -->`, `<span title=\"((${INNER_UUID}))\">text</span>`, `[link](target \"((${INNER_UUID}))\")`, `    ((${INNER_UUID}))`, `~~~ ((${INNER_UUID}))`]) { assert.equal(composeNested(protectedMarkdown), undefined, `protected nested reference must remain inert: ${protectedMarkdown}`); }",
	"assert.equal(nestedResolveCount, resolvedBeforeProtectedCases, 'code, comments, HTML, links, escapes, and code lines must not resolve a nested image or trigger a request');",
	"assert.deepEqual(calculateBlockReferenceImageFrame({ src: 'x.png', alt: '' }), { width: 120, height: 90 }, 'unknown image dimensions must reserve a stable default frame');",
	"assert.deepEqual(calculateBlockReferenceImageFrame({ src: 'x.png', alt: '', width: 400 }), { width: 400, height: 300 }, 'explicit Image Converter widths must remain intact before the container applies its responsive cap');",
	"assert.deepEqual(calculateBlockReferenceImageFrame({ src: 'x.png', alt: '', height: 120 }), { width: 160, height: 120 }, 'a height hint must preserve the default four-by-three ratio');",
	"assert.deepEqual(calculateBlockReferenceImageFrame({ src: 'x.png', alt: '', width: 359, height: 39 }), { width: 359, height: 39 }, 'explicit width and height must not be silently capped');",
	"assert.deepEqual(calculateBlockReferenceImageFrame({ src: 'x.png', alt: '', width: 32, height: 39 }), { width: 32, height: 39 }, 'small Logseq dimensions must be respected without enlargement');",
	"assert.deepEqual(calculateBlockReferenceImageFrame({ src: 'x.png', alt: '', width: 359 }, { width: 718, height: 359 }), { width: 359, height: 180 }, 'a width-only Image Converter hint must adopt the decoded natural ratio without losing its requested width');",
	"assert.deepEqual(calculateBlockReferenceImageFrame({ src: 'x.png', alt: '', height: 120 }, { width: 100, height: 200 }), { width: 60, height: 120 }, 'a height-only Logseq hint must adopt the decoded natural ratio');",
	"assert.deepEqual(calculateBlockReferenceImageFrame({ src: 'x.png', alt: '' }, { width: 100, height: 200 }), { width: 90, height: 180 }, 'unsized images alone must keep the safe thumbnail cap while adopting the decoded ratio');",
	'',
	"console.log('Block image extraction tests passed.');",
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
