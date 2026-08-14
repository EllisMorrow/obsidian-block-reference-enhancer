import { t } from '../i18n';

export function createInlineReferencePlainText(expandedLine: string): string {
	return expandedLine
		.replace(/!\[\[([^\]]+)\]\]/g, '$1')
		.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
		.replace(/\[\[([^\]]+)\]\]/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/^#{1,6}\s+/g, '')
		.replace(/[*_~`]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function createInlineReferenceSummary(expandedLine: string): string {
	return createInlineReferencePlainText(expandedLine) || t('render.emptyBlockBracketed');
}
