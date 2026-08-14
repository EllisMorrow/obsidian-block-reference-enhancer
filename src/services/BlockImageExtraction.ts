import { getOpeningMarkdownFenceState, isClosingMarkdownFence, type MarkdownFenceState } from '../utils/markdownFence';

export interface BlockImageSpec {
	src: string;
	alt: string;
	width?: number;
	height?: number;
}

export interface BlockFirstLineImageExtraction {
	image: BlockImageSpec | null;
	summaryMarkdown: string;
}

export type BlockFirstLineImageSegment =
	| { type: 'text'; markdown: string }
	| { type: 'image'; markdown: string; image: BlockImageSpec };

export type BlockReferenceRenderSegment =
	| { type: 'text'; text: string }
	| { type: 'image'; image: BlockImageSpec };

export interface BlockFirstLineImagesExtraction {
	segments: BlockFirstLineImageSegment[];
	images: BlockImageSpec[];
	summaryMarkdown: string;
}

export interface BlockImageExtractionOptions {
	protectMarkdownCodeLine?: boolean;
}

export interface PreparedBlockEmbedImage {
	image: BlockImageSpec;
	renderedAlt: string;
}

export interface PreparedBlockEmbedMarkdown {
	markdown: string;
	images: PreparedBlockEmbedImage[];
}

const MAX_IMAGE_DIMENSION_PX = 4096;
const MARKDOWN_IMAGE_REGEX = /!\[([^\]\r\n]*)\]\(([^()\s\r\n]+)\)/g;
const LOGSEQ_IMAGE_SIZE_ATTRIBUTES_REGEX = /^\s*\{:\s*([^{}\r\n]*)\}/;
const LOGSEQ_IMAGE_SIZE_PROPERTY_REGEX = /(?:^|[\s,]+):?(width|height)\s*(?::\s*|\s+)([^\s,}]+)/gi;
const INDENTED_CODE_LINE_REGEX = /^(?: {4}| {0,3}\t)/;
const FENCED_CODE_OPENING_LINE_REGEX = /^ {0,3}(?:`{3,}|~{3,})/;
const EXPLICIT_INDENTED_LIST_ITEM_REGEX = /^(?: {4,}| {0,3}\t[ \t]*)(?:[-+*]|\d+[.)])[ \t]+/;
const RAW_HTML_TEXT_TAGS = new Set(['code', 'pre', 'script', 'style', 'textarea']);

/**
 * Extracts the first Markdown image from a source block title without parsing
 * or normalizing any other Markdown. The optional Logseq size attribute list
 * is consumed only when it immediately follows that image and contains size
 * properties exclusively.
 */
export function extractBlockFirstLineImage(firstLine: string): BlockFirstLineImageExtraction {
	const extraction = extractRenderableMarkdownImages(firstLine, 1);
	if (extraction.images.length === 0) {
		return { image: null, summaryMarkdown: firstLine };
	}

	return {
		image: extraction.images[0],
		summaryMarkdown: extraction.summaryMarkdown,
	};
}

/**
 * Splits a block title into renderable Markdown images and untouched Markdown
 * text. Text segments preserve the source verbatim and in source order. Only
 * a recognized image and its immediately adjacent, valid Logseq size suffix
 * are removed from the text stream.
 */
export function extractBlockFirstLineImages(
	firstLine: string,
	options: BlockImageExtractionOptions = {},
): BlockFirstLineImagesExtraction {
	return extractRenderableMarkdownImages(
		firstLine,
		Number.POSITIVE_INFINITY,
		options.protectMarkdownCodeLine ?? true,
	);
}

/**
 * Removes only recognized Logseq image-size suffixes. The Markdown image
 * source and every protected or unrecognized construct remain unchanged.
 * This lets the host Markdown renderer handle full embeds without displaying
 * Logseq's attribute text.
 */
export function stripLogseqImageSizeAttributes(firstLine: string): string {
	return extractRenderableMarkdownImages(firstLine).segments
		.map((segment) => segment.markdown)
		.join('');
}

/**
 * Prepares full embed Markdown without changing code or comment regions. The
 * host renderer still owns Markdown semantics; this pass only removes valid
 * Logseq size suffixes and records the corresponding native images.
 */
export function prepareBlockEmbedMarkdownImages(markdown: string): PreparedBlockEmbedMarkdown {
	const images: PreparedBlockEmbedImage[] = [];
	const protectedState: MarkdownProtectedRegionState = {
		htmlComment: false,
		obsidianComment: false,
		rawHtmlTag: null,
	};
	let fenceState: MarkdownFenceState | null = null;
	const lineBreak = markdown.includes('\r\n') ? '\r\n' : '\n';
	const lines = markdown.split(/\r?\n/).map((line) => {
		if (fenceState) {
			if (isClosingMarkdownFence(line, fenceState)) {
				fenceState = null;
			}
			return line;
		}

		let protectedPrefix = '';
		let renderableLine = line;
		let stateAlreadyAdvanced = false;
		if (isProtectedRegionActive(protectedState)) {
			const renderableOffset = advanceMarkdownProtectedRegionState(line, protectedState);
			if (renderableOffset === null) {
				return line;
			}
			protectedPrefix = line.slice(0, renderableOffset);
			renderableLine = line.slice(renderableOffset);
			stateAlreadyAdvanced = true;
		}

		const openingFence = stateAlreadyAdvanced ? null : getOpeningMarkdownFenceState(renderableLine);
		if (openingFence) {
			fenceState = openingFence;
			return line;
		}

		const isIndentedListItem = !stateAlreadyAdvanced && EXPLICIT_INDENTED_LIST_ITEM_REGEX.test(renderableLine);
		if (!stateAlreadyAdvanced && INDENTED_CODE_LINE_REGEX.test(renderableLine) && !isIndentedListItem) {
			return line;
		}

		const extraction = extractBlockFirstLineImages(renderableLine, {
			protectMarkdownCodeLine: !stateAlreadyAdvanced && !isIndentedListItem,
		});
		if (!stateAlreadyAdvanced) {
			advanceMarkdownProtectedRegionState(line, protectedState);
		}
		for (const segment of extraction.segments) {
			if (segment.type !== 'image') {
				continue;
			}
			const closingAltIndex = segment.markdown.indexOf('](');
			images.push({
				image: segment.image,
				renderedAlt: closingAltIndex >= 2 ? segment.markdown.slice(2, closingAltIndex) : segment.image.alt,
			});
		}
		return protectedPrefix + extraction.segments.map((segment) => segment.markdown).join('');
	});

	return { markdown: lines.join(lineBreak), images };
}

interface MarkdownProtectedRegionState {
	htmlComment: boolean;
	obsidianComment: boolean;
	rawHtmlTag: string | null;
}

function isProtectedRegionActive(state: MarkdownProtectedRegionState): boolean {
	return state.htmlComment || state.obsidianComment || state.rawHtmlTag !== null;
}

function advanceMarkdownProtectedRegionState(line: string, state: MarkdownProtectedRegionState): number | null {
	const startedProtected = isProtectedRegionActive(state);
	// Obsidian comments are inline delimiters, so Markdown after a closing %% on
	// the same line is renderable. CommonMark HTML/raw blocks own their complete
	// closing line, so those lines remain untouched and resume on the next line.
	const canResumeOnClosingLine = state.obsidianComment && !state.htmlComment && state.rawHtmlTag === null;
	let firstRenderableOffset: number | null = startedProtected ? null : 0;
	const recordRenderableOffset = (offset: number) => {
		if (canResumeOnClosingLine && firstRenderableOffset === null && !isProtectedRegionActive(state)) {
			firstRenderableOffset = offset;
		}
	};
	let inlineCodeTicks = 0;
	let cursor = 0;
	while (cursor < line.length) {
		if (state.htmlComment) {
			if (line.startsWith('-->', cursor)) {
				state.htmlComment = false;
				cursor += 3;
				recordRenderableOffset(cursor);
			} else {
				cursor += 1;
			}
			continue;
		}

		if (state.obsidianComment) {
			if (line.startsWith('%%', cursor) && !isEscaped(line, cursor)) {
				state.obsidianComment = false;
				cursor += 2;
				recordRenderableOffset(cursor);
			} else {
				cursor += 1;
			}
			continue;
		}

		if (state.rawHtmlTag) {
			const tag = line[cursor] === '<' ? parseRawHtmlTextTagAt(line, cursor) : null;
			if (tag?.closing && tag.name === state.rawHtmlTag) {
				state.rawHtmlTag = null;
				cursor = tag.end;
				recordRenderableOffset(cursor);
			} else {
				cursor += 1;
			}
			continue;
		}

		if (line[cursor] === '`' && !isEscaped(line, cursor)) {
			let tickCount = 1;
			while (line[cursor + tickCount] === '`') {
				tickCount += 1;
			}
			if (inlineCodeTicks === 0) {
				inlineCodeTicks = tickCount;
			} else if (inlineCodeTicks === tickCount) {
				inlineCodeTicks = 0;
			}
			cursor += tickCount;
			continue;
		}
		if (inlineCodeTicks > 0 || isEscaped(line, cursor)) {
			cursor += 1;
			continue;
		}

		if (line.startsWith('<!--', cursor) && !isInsideHtmlTag(line, cursor)) {
			state.htmlComment = true;
			cursor += 4;
			continue;
		}
		if (line.startsWith('%%', cursor) && !isInsideHtmlTag(line, cursor)) {
			state.obsidianComment = true;
			cursor += 2;
			continue;
		}

		const rawHtmlTag = line[cursor] === '<' && !isInsideHtmlTag(line, cursor)
			? parseRawHtmlTextTagAt(line, cursor)
			: null;
		if (rawHtmlTag && !rawHtmlTag.closing && !rawHtmlTag.selfClosing) {
			state.rawHtmlTag = rawHtmlTag.name;
			cursor = rawHtmlTag.end;
			continue;
		}

		cursor += 1;
	}
	return firstRenderableOffset;
}

function parseRawHtmlTextTagAt(
	value: string,
	index: number,
): { name: string; closing: boolean; selfClosing: boolean; end: number } | null {
	const opening = value.slice(index).match(/^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9-]*)\b/);
	if (!opening) {
		return null;
	}

	const name = opening[2].toLowerCase();
	if (!RAW_HTML_TEXT_TAGS.has(name)) {
		return null;
	}

	let quote: '"' | "'" | null = null;
	let cursor = index + opening[0].length;
	for (; cursor < value.length; cursor++) {
		const character = value[cursor];
		if (quote) {
			if (character === quote) {
				quote = null;
			}
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}
		if (character === '>') {
			const tagText = value.slice(index, cursor + 1);
			return {
				name,
				closing: opening[1] === '/',
				selfClosing: /\/\s*>$/.test(tagText),
				end: cursor + 1,
			};
		}
	}

	return {
		name,
		closing: opening[1] === '/',
		selfClosing: false,
		end: value.length,
	};
}

function extractRenderableMarkdownImages(
	firstLine: string,
	maximumImages = Number.POSITIVE_INFINITY,
	protectMarkdownCodeLine = true,
): BlockFirstLineImagesExtraction {
	if (protectMarkdownCodeLine
		&& (INDENTED_CODE_LINE_REGEX.test(firstLine) || FENCED_CODE_OPENING_LINE_REGEX.test(firstLine))) {
		return {
			segments: firstLine ? [{ type: 'text', markdown: firstLine }] : [],
			images: [],
			summaryMarkdown: firstLine,
		};
	}

	const segments: BlockFirstLineImageSegment[] = [];
	const images: BlockImageSpec[] = [];
	let textStart = 0;

	MARKDOWN_IMAGE_REGEX.lastIndex = 0;
	let imageMatch: RegExpExecArray | null;
	while (images.length < maximumImages && (imageMatch = MARKDOWN_IMAGE_REGEX.exec(firstLine))) {
		if (!isRenderableMarkdownImage(firstLine, imageMatch.index)) {
			continue;
		}

		if (imageMatch.index > textStart) {
			segments.push({ type: 'text', markdown: firstLine.slice(textStart, imageMatch.index) });
		}

		const image = createBlockImageSpec(imageMatch[1], imageMatch[2]);
		let removalEnd = imageMatch.index + imageMatch[0].length;
		const attributeMatch = firstLine.slice(removalEnd).match(LOGSEQ_IMAGE_SIZE_ATTRIBUTES_REGEX);
		if (attributeMatch) {
			const dimensions = parseLogseqImageSizeAttributes(attributeMatch[1]);
			if (dimensions) {
				if (dimensions.width !== undefined) {
					image.width = dimensions.width;
				}
				if (dimensions.height !== undefined) {
					image.height = dimensions.height;
				}
				removalEnd += attributeMatch[0].length;
			}
		}

		segments.push({ type: 'image', markdown: imageMatch[0], image });
		images.push(image);
		textStart = removalEnd;
		MARKDOWN_IMAGE_REGEX.lastIndex = removalEnd;
	}

	if (textStart < firstLine.length) {
		segments.push({ type: 'text', markdown: firstLine.slice(textStart) });
	}

	return {
		segments,
		images,
		summaryMarkdown: segments
			.filter((segment): segment is Extract<BlockFirstLineImageSegment, { type: 'text' }> => segment.type === 'text')
			.map((segment) => segment.markdown)
			.join(''),
	};
}

function createBlockImageSpec(rawAlt: string, src: string): BlockImageSpec {
	const numericAltWidth = parseImageDimension(rawAlt.trim());
	if (numericAltWidth !== undefined) {
		return { src, alt: '', width: numericAltWidth };
	}

	const converterSizeMatch = rawAlt.match(/^(.*)\|\s*(\d+)\s*$/);
	if (converterSizeMatch) {
		const converterWidth = parseImageDimension(converterSizeMatch[2]);
		if (converterWidth !== undefined) {
			return { src, alt: converterSizeMatch[1].trimEnd(), width: converterWidth };
		}
	}

	return { src, alt: rawAlt };
}

function isRenderableMarkdownImage(firstLine: string, index: number): boolean {
	return !isProtectedBlockInlineMarkdownPosition(firstLine, index);
}

/**
 * Shared safety boundary for lightweight inline enrichments. Callers that
 * replace syntax with active DOM (images, nested references, and similar)
 * must not do so inside code, comments, HTML, or Markdown link destinations.
 */
export function isProtectedBlockInlineMarkdownPosition(value: string, index: number): boolean {
	return isEscaped(value, index)
		|| isInsideInlineCode(value, index)
		|| isInsideObsidianComment(value, index)
		|| isInsideHtmlComment(value, index)
		|| isInsideHtmlTag(value, index)
		|| isInsideMarkdownLinkDestination(value, index)
		|| isInsideRawHtmlText(value, index);
}

export function isProtectedBlockMarkdownCodeLine(value: string): boolean {
	return INDENTED_CODE_LINE_REGEX.test(value) || FENCED_CODE_OPENING_LINE_REGEX.test(value);
}

function isEscaped(value: string, index: number): boolean {
	let backslashCount = 0;
	for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor--) {
		backslashCount += 1;
	}
	return backslashCount % 2 === 1;
}

function isInsideInlineCode(value: string, index: number): boolean {
	let openingTicks = 0;
	let cursor = 0;
	while (cursor < index) {
		if (value[cursor] !== '`' || isEscaped(value, cursor)) {
			cursor += 1;
			continue;
		}

		let tickCount = 1;
		while (cursor + tickCount < index && value[cursor + tickCount] === '`') {
			tickCount += 1;
		}
		if (openingTicks === 0) {
			openingTicks = tickCount;
		} else if (tickCount === openingTicks) {
			openingTicks = 0;
		}
		cursor += tickCount;
	}
	return openingTicks > 0;
}

function isInsideHtmlComment(value: string, index: number): boolean {
	const prefix = value.slice(0, index);
	return prefix.lastIndexOf('<!--') > prefix.lastIndexOf('-->');
}

function isInsideObsidianComment(value: string, index: number): boolean {
	let insideComment = false;
	let cursor = 0;
	while (cursor < index - 1) {
		const delimiterIndex = value.indexOf('%%', cursor);
		if (delimiterIndex === -1 || delimiterIndex >= index) {
			break;
		}
		if (!isEscaped(value, delimiterIndex) && !isInsideInlineCode(value, delimiterIndex)) {
			insideComment = !insideComment;
		}
		cursor = delimiterIndex + 2;
	}
	return insideComment;
}

function isInsideHtmlTag(value: string, index: number): boolean {
	let insideTag = false;
	let quote: '"' | "'" | null = null;
	for (let cursor = 0; cursor < index; cursor++) {
		const character = value[cursor];
		if (!insideTag) {
			if (character === '<') {
				insideTag = true;
			}
			continue;
		}

		if (quote) {
			if (character === quote) {
				quote = null;
			}
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
		} else if (character === '>') {
			insideTag = false;
		}
	}
	return insideTag;
}

function isInsideMarkdownLinkDestination(value: string, index: number): boolean {
	let depth = 0;
	let quotedTitle: '"' | "'" | null = null;
	let angleDestination = false;

	for (let cursor = 0; cursor < index; cursor++) {
		if (isEscaped(value, cursor)) {
			continue;
		}

		const character = value[cursor];
		if (depth === 0) {
			if (character === ']'
				&& value[cursor + 1] === '('
				&& !isInsideInlineCode(value, cursor)
				&& !isInsideObsidianComment(value, cursor)
				&& !isInsideHtmlComment(value, cursor)
				&& !isInsideHtmlTag(value, cursor)) {
				depth = 1;
				cursor += 1;
			}
			continue;
		}

		if (quotedTitle) {
			if (character === quotedTitle) {
				quotedTitle = null;
			}
			continue;
		}
		if (angleDestination) {
			if (character === '>') {
				angleDestination = false;
			}
			continue;
		}

		if (character === '<' && depth === 1) {
			angleDestination = true;
			continue;
		}
		if ((character === '"' || character === "'")
			&& depth === 1
			&& cursor > 0
			&& /\s/.test(value[cursor - 1])) {
			quotedTitle = character;
			continue;
		}
		if (character === '(') {
			depth += 1;
		} else if (character === ')') {
			depth -= 1;
		}
	}

	return depth > 0;
}

function isInsideRawHtmlText(value: string, index: number): boolean {
	const prefix = value.slice(0, index).toLowerCase();
	return ['code', 'pre', 'script', 'style', 'textarea'].some((tag) => {
		return prefix.lastIndexOf(`<${tag}`) > prefix.lastIndexOf(`</${tag}>`);
	});
}

function parseLogseqImageSizeAttributes(rawAttributes: string): Pick<BlockImageSpec, 'width' | 'height'> | null {
	const normalizedAttributes = rawAttributes.trim();
	const dimensions: Pick<BlockImageSpec, 'width' | 'height'> = {};
	let parsedLength = 0;
	let match: RegExpExecArray | null;
	LOGSEQ_IMAGE_SIZE_PROPERTY_REGEX.lastIndex = 0;

	while ((match = LOGSEQ_IMAGE_SIZE_PROPERTY_REGEX.exec(normalizedAttributes))) {
		parsedLength += match[0].length;
		const dimension = parseImageDimension(match[2]);
		if (dimension !== undefined) {
			dimensions[match[1].toLowerCase() as 'width' | 'height'] = dimension;
		}
	}

	// Do not consume an arbitrary attribute list or prose that merely starts
	// with "{:". Only the compact Logseq width/height form is recognized.
	if (parsedLength === 0 || parsedLength !== normalizedAttributes.length) {
		return null;
	}

	return dimensions;
}

function parseImageDimension(value: string): number | undefined {
	if (!/^\d+$/.test(value)) {
		return undefined;
	}

	const dimension = Number(value);
	return Number.isSafeInteger(dimension) && dimension >= 1 && dimension <= MAX_IMAGE_DIMENSION_PX
		? dimension
		: undefined;
}
