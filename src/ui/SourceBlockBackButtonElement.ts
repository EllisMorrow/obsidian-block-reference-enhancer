import { getDocument } from '../utils/dom';
import { t } from '../i18n';

export function createSourceBlockBackButtonElement(
	blockId: string,
	owner?: Node | Document | null,
): HTMLButtonElement {
	const button = getDocument(owner).createElement('button');
	button.type = 'button';
	button.className = 'block-reference-back-button';
	button.dataset.blockRefSourceId = blockId;
	button.setAttribute('aria-label', t('aria.openSource'));
	button.setText(t('action.back'));
	return button;
}
