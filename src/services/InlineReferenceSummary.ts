export function createInlineReferenceSummary(expandedLine: string): string {
	const plainText = expandedLine
		.replace(/!\[\[([^\]]+)\]\]/g, '$1')
		.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
		.replace(/\[\[([^\]]+)\]\]/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/^#{1,6}\s+/g, '')
		.replace(/[*_~`]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

	return plainText || '[empty block]';
}
