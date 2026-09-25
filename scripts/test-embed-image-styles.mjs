import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the actual method without starting Obsidian or refactoring plugin lifecycle code.
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
let method;
function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(ast) === 'applyEmbedImageSizes') method = node;
    ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(method, 'embed sizing method must exist');
const code = ts.transpileModule(`class Harness { ${method.getText(ast)} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2018 },
}).outputText;
const Harness = new Function(`${code}; return Harness;`)();
const harness = new Harness();
harness.resolveInlineReferenceImage = (image) => image;
harness.normalizeRenderedImageSource = (src) => src;

function makeImage(src = 'image.png', alt = '') {
    const style = { color: 'red' };
    return {
        src, alt, style, attributes: {}, classes: [],
        addClass(value) { this.classes.push(value); },
        setAttribute(key, value) { this.attributes[key] = value; },
        setCssStyles(values) { Object.assign(style, values); },
    };
}
function apply(images, specs) {
    harness.applyEmbedImageSizes({ querySelectorAll: () => images, ownerDocument: {} },
        specs.map((image) => ({ image, renderedAlt: image.alt })), 'notes/source.md');
}

for (const [size, expectedStyle, expectedAttributes] of [
    [{}, {}, {}],
    [{ width: 359 }, { maxWidth: '100%', width: '359px', height: 'auto' }, { width: '359' }],
    [{ height: 44 }, { maxWidth: '100%', width: 'auto', height: '44px' }, { height: '44' }],
    [{ width: 32, height: 39 }, { maxWidth: '100%', width: '32px', height: 'auto', aspectRatio: '32 / 39' }, { width: '32', height: '39' }],
]) {
    const image = makeImage();
    apply([image], [{ src: image.src, alt: '', ...size }]);
    assert.deepEqual(image.style, { color: 'red', ...expectedStyle });
    assert.deepEqual(image.attributes, expectedAttributes);
    assert.equal(image.classes.length, Object.keys(size).length === 0 ? 0 : 1);
}

const first = makeImage('same.png', 'first');
const second = makeImage('same.png', 'second');
const unrelated = makeImage('other.png');
apply([second, unrelated, first], [
    { src: 'same.png', alt: 'first', width: 39, height: 44 },
    { src: 'same.png', alt: 'second', width: 32, height: 39 },
    { src: 'missing.png', alt: '', width: 999 },
]);
assert.equal(first.style.width, '39px', 'same-source images must retain their own sizes');
assert.equal(second.style.width, '32px');
assert.deepEqual(unrelated.style, { color: 'red' }, 'unmatched images must remain untouched');
const repeated = [makeImage(), makeImage()];
apply(repeated, [
    { src: 'image.png', alt: '', width: 100 },
    { src: 'image.png', alt: '', width: 200 },
]);
assert.deepEqual(repeated.map((image) => image.style.width), ['100px', '200px']);

// Guard the specific review failure as well as the sizing behavior above.
function checkStaticAssignments(node) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isPropertyAccessExpression(node.left)
        && ts.isPropertyAccessExpression(node.left.expression)
        && node.left.expression.name.text === 'style'
        && ts.isStringLiteral(node.right)) {
        assert.fail('Use the Obsidian style helper for static embed image styles');
    }
    ts.forEachChild(node, checkStaticAssignments);
}
checkStaticAssignments(method);
console.log('Embed image style tests passed.');
