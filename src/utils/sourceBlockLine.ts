const HORIZONTAL_RULE_REGEX = /^[ \t]*(?:-[ \t]*){3,}$/;
const SOURCE_BLOCK_LINE_REGEX = /^([ \t]*)-(?:[ \t]+(.*)|[ \t]*)$/;

export interface SourceBlockLineInfo {
	leadingWhitespace: string;
	content: string;
}

/** Parses hyphen list items, including empty items, without accepting horizontal rules. */
export function parseSourceBlockLine(line: string): SourceBlockLineInfo | null {
	if (HORIZONTAL_RULE_REGEX.test(line)) {
		return null;
	}

	const match = line.match(SOURCE_BLOCK_LINE_REGEX);
	if (!match) {
		return null;
	}

	return {
		leadingWhitespace: match[1] ?? '',
		content: match[2] ?? '',
	};
}

export function buildSourceBlockIdInsertion(line: string, blockId: string): string | null {
	const blockLine = parseSourceBlockLine(line);
	if (!blockLine) {
		return null;
	}

	return `\n${blockLine.leadingWhitespace}  id:: ${blockId}`;
}
