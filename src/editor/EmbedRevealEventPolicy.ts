const EMBED_REVEAL_CONTROL_SELECTOR = [
	'.block-reference-action-buttons',
	'.block-reference-back-button',
	'.block-reference-delete-button',
	'.block-reference-embed-fold-toggle',
].join(', ');

export function isEmbedRevealControlTarget(target: Pick<Element, 'closest'>): boolean {
	return target.closest(EMBED_REVEAL_CONTROL_SELECTOR) !== null;
}
