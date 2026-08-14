import type {
	BlockFirstLineImageSegment,
	BlockImageSpec,
	BlockReferenceRenderSegment,
} from './BlockImageExtraction';
import {
	isProtectedBlockInlineMarkdownPosition,
	isProtectedBlockMarkdownCodeLine,
} from './BlockImageExtraction';

const NESTED_BLOCK_REFERENCE_PATTERN = '\\{\\{embed\\s+\\(\\(([A-Za-z0-9_-]{36,})\\)\\)\\s*\\}\\}|\\(\\(([A-Za-z0-9_-]{36,})\\)\\)|（（([A-Za-z0-9_-]{36,})））';

export interface NestedInlineReferenceRenderInfo {
	text: string | null;
	segments?: readonly BlockReferenceRenderSegment[];
}

export interface ComposeNestedInlineReferenceSegmentsOptions {
	missingReferenceText: string;
	renderText: (markdown: string) => string;
	resolveImage: (image: BlockImageSpec) => BlockImageSpec | null;
	resolveNestedReference: (uuid: string) => NestedInlineReferenceRenderInfo;
}

export function replaceNestedBlockReferencesWithText(
	markdown: string,
	resolveNestedReference: (uuid: string) => string | null,
	missingReferenceText: string,
): string {
	let result = '';
	visitNestedReferences(
		markdown,
		(text) => { result += text; },
		(uuid) => { result += resolveNestedReference(uuid) ?? missingReferenceText; },
		true,
	);
	return result;
}

/**
 * Builds the inline DOM model while preserving image segments returned by a
 * nested block reference. The caller still owns vault-path resolution, so a
 * nested image remains resolved relative to the nested block's own file.
 */
export function composeNestedInlineReferenceSegments(
	sourceSegments: readonly BlockFirstLineImageSegment[],
	options: ComposeNestedInlineReferenceSegmentsOptions,
): BlockReferenceRenderSegment[] | undefined {
	const output: BlockReferenceRenderSegment[] = [];
	let pendingMarkdown = '';
	let hasImage = false;

	const appendText = (text: string) => {
		if (text) {
			output.push({ type: 'text', text });
		}
	};
	const flushPendingMarkdown = () => {
		if (!pendingMarkdown) {
			return;
		}
		appendText(options.renderText(pendingMarkdown));
		pendingMarkdown = '';
	};

	const appendNestedReference = (uuid: string) => {
		const nested = options.resolveNestedReference(uuid);
		const nestedHasImage = nested.segments?.some((segment) => segment.type === 'image') ?? false;
		if (!nestedHasImage) {
			pendingMarkdown += nested.text ?? options.missingReferenceText;
			return;
		}

		flushPendingMarkdown();
		for (const segment of nested.segments ?? []) {
			if (segment.type === 'image') {
				hasImage = true;
				output.push({ type: 'image', image: segment.image });
			} else {
				appendText(segment.text);
			}
		}
	};

	for (let segmentIndex = 0; segmentIndex < sourceSegments.length; segmentIndex++) {
		const segment = sourceSegments[segmentIndex];
		if (segment.type === 'text') {
			visitNestedReferences(
				segment.markdown,
				(text) => { pendingMarkdown += text; },
				appendNestedReference,
				segmentIndex === 0,
			);
			continue;
		}

		const image = options.resolveImage(segment.image);
		if (!image) {
			pendingMarkdown += segment.markdown;
			continue;
		}

		flushPendingMarkdown();
		output.push({ type: 'image', image });
		hasImage = true;
	}
	flushPendingMarkdown();

	return hasImage ? output : undefined;
}

function visitNestedReferences(
	markdown: string,
	visitText: (text: string) => void,
	visitReference: (uuid: string) => void,
	protectMarkdownCodeLine: boolean,
): void {
	if (protectMarkdownCodeLine && isProtectedBlockMarkdownCodeLine(markdown)) {
		visitText(markdown);
		return;
	}
	const regex = new RegExp(NESTED_BLOCK_REFERENCE_PATTERN, 'g');
	let cursor = 0;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(markdown))) {
		if (isProtectedBlockInlineMarkdownPosition(markdown, match.index)) {
			continue;
		}

		visitText(markdown.slice(cursor, match.index));
		visitReference(match[1] ?? match[2] ?? match[3]);
		cursor = match.index + match[0].length;
	}
	visitText(markdown.slice(cursor));
}
