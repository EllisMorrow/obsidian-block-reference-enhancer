import { getDocument } from '../utils/dom';
import { t } from '../i18n';

export function createSourceReferenceBadgeElement(
    blockId: string,
    count: number,
    sourceFilePath?: string,
    sourceStartLine?: number,
    owner?: Node | Document | null,
): HTMLButtonElement {
    const button = getDocument(owner).createElement('button');
    button.type = 'button';
    button.className = 'block-reference-source-badge';
    button.dataset.blockRefSourceId = blockId;
    button.dataset.blockRefSourceCount = String(count);
    if (sourceFilePath) {
        button.dataset.blockRefSourceFilePath = sourceFilePath;
    }
    if (typeof sourceStartLine === 'number') {
        button.dataset.blockRefSourceStartLine = String(sourceStartLine);
    }
    button.setAttribute('aria-label', t('aria.referencedTimes', { count }));
    button.setText(String(count));
    return button;
}
