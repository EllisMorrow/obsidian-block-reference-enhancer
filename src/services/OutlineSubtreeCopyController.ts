import { Editor, Notice } from 'obsidian';
import { resolveUnorderedListSubtree } from '../editor/UnorderedListStructure';
import { t } from '../i18n';

const RESULT_NOTICE_DURATION_MS = 4000;

export function canCopyCurrentLevelAndChildren(editor: Editor, targetLine: number): boolean {
	return resolveUnorderedListSubtree(editor.getValue(), targetLine) !== null;
}

export async function copyCurrentLevelAndChildren(editor: Editor, targetLine: number): Promise<void> {
	const subtree = resolveUnorderedListSubtree(editor.getValue(), targetLine);
	if (!subtree) {
		new Notice(t('notice.copyLevelUnavailable'), RESULT_NOTICE_DURATION_MS);
		return;
	}

	try {
		await navigator.clipboard.writeText(subtree.normalizedMarkdown);
		new Notice(t('notice.copyLevelDone'), RESULT_NOTICE_DURATION_MS);
	} catch {
		new Notice(t('notice.copyLevelFailed'), RESULT_NOTICE_DURATION_MS);
	}
}
