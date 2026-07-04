import { getDocument } from '../utils/dom';
import { t } from '../i18n';

export function createBlockReferenceDeleteButtonElement(
	owner?: Node | Document | null,
): HTMLButtonElement {
	const button = getDocument(owner).createElement('button');
	button.type = 'button';
	button.className = 'block-reference-delete-button';
	button.setAttribute('aria-label', t('aria.deleteSyntax'));
	button.setText(t('action.delete'));
	return button;
}
