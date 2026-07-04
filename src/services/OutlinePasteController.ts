import {
	App,
	Editor,
	MarkdownFileInfo,
	MarkdownView,
	Notice,
	TFile,
	htmlToMarkdown,
} from 'obsidian';
import { readOutlineClipboard } from './OutlineClipboardReader';
import {
	OutlinePasteError,
	createOutlinePasteParserOptions,
	inspectOutlinePasteInput,
	parseOutlinePasteInput,
} from './OutlinePasteParser';
import { renderOutlineNodes } from './OutlinePasteRenderer';
import {
	createOutlinePasteTextAnchor,
	resolveOutlinePasteTextAnchor,
	type OutlinePasteTextAnchor,
} from './OutlinePasteTarget';
import { resolveOutlinePasteInsertionContext } from '../editor/UnorderedListStructure';
import { confirmLargeOutlinePaste } from '../ui/LargeOutlinePasteConfirmModal';
import { t } from '../i18n';

const STATUS_NOTICE_DURATION_MS = 0;
const RESULT_NOTICE_DURATION_MS = 5000;
const PROGRESS_UPDATE_INTERVAL_MS = 200;

interface ActiveOutlinePasteJob {
	abortController: AbortController;
	statusNotice: Notice;
}

export class OutlinePasteController {
	private activeJob: ActiveOutlinePasteJob | null = null;

	constructor(private readonly app: App) {}

	canPaste(editor: Editor, targetLine: number): boolean {
		return resolveOutlinePasteInsertionContext(editor.getValue(), targetLine) !== null;
	}

	dispose() {
		this.activeJob?.abortController.abort();
		this.activeJob?.statusNotice.hide();
		this.activeJob = null;
	}

	async paste(
		editor: Editor,
		info: MarkdownView | MarkdownFileInfo,
		targetLine: number,
	): Promise<void> {
		if (this.activeJob) {
			new Notice(t('outline.busy'), RESULT_NOTICE_DURATION_MS);
			return;
		}

		const file = info.file;
		const anchor = createOutlinePasteTextAnchor(editor.getValue(), targetLine);
		if (!(file instanceof TFile) || !anchor) {
			new Notice(t('outline.unavailable'), RESULT_NOTICE_DURATION_MS);
			return;
		}

		const abortController = new AbortController();
		const statusNotice = new Notice(t('outline.reading'), STATUS_NOTICE_DURATION_MS);
		this.activeJob = { abortController, statusNotice };

		try {
			const payload = await readOutlineClipboard();
			this.throwIfCancelled(abortController.signal);
			const preflight = inspectOutlinePasteInput(payload);
			if (!preflight.processable) {
				throw new OutlinePasteError('too-large', preflight.message ?? t('outline.limitExceeded'));
			}

			if (preflight.requiresConfirmation) {
				statusNotice.setMessage(t('outline.waitingConfirmation'));
				const shouldProcess = await confirmLargeOutlinePaste(this.app, preflight, abortController.signal);
				if (!shouldProcess) {
					return;
				}
			}

			statusNotice.setMessage(t('outline.converting'));
			let lastProgressUpdate = 0;
			let lastProgressPercent = -1;
			const parseResult = await parseOutlinePasteInput(payload, createOutlinePasteParserOptions(preflight, {
				htmlToMarkdown,
				isCancelled: () => abortController.signal.aborted,
				onProgress: (progress) => {
					const now = Date.now();
					const percent = Math.max(1, Math.min(95, Math.floor(progress * 100)));
					if (percent === lastProgressPercent || now - lastProgressUpdate < PROGRESS_UPDATE_INTERVAL_MS) {
						return;
					}

					lastProgressPercent = percent;
					lastProgressUpdate = now;
					statusNotice.setMessage(t('outline.convertingProgress', { percent }));
				},
			}));
			this.throwIfCancelled(abortController.signal);

			statusNotice.setMessage(t('outline.resolvingLocation'));
			const insertResult = await this.insertIntoOriginalFile(
				file,
				anchor,
				parseResult.nodes,
				parseResult.maxOutputMarkdownBytes,
				abortController.signal,
			);

			new Notice(
				parseResult.simplified
					? t('outline.pastedSimplified', { count: parseResult.nodeCount, path: file.path })
					: t('outline.pasted', { count: parseResult.nodeCount, path: file.path }),
				RESULT_NOTICE_DURATION_MS,
			);

			if (insertResult.editor && this.isEditorActiveForFile(insertResult.editor, file)) {
				insertResult.editor.setCursor(insertResult.editor.offsetToPos(insertResult.cursorOffset));
			}
		} catch (error) {
			if (!isOutlinePasteCancelled(error)) {
				new Notice(resolveOutlinePasteFailureMessage(error), RESULT_NOTICE_DURATION_MS);
			}
		} finally {
			statusNotice.hide();
			if (this.activeJob?.abortController === abortController) {
				this.activeJob = null;
			}
		}
	}

	private async insertIntoOriginalFile(
		file: TFile,
		anchor: OutlinePasteTextAnchor,
		nodes: Parameters<typeof renderOutlineNodes>[0],
		maxOutputMarkdownBytes: number,
		signal: AbortSignal,
	): Promise<{ editor: Editor | null; cursorOffset: number }> {
		this.throwIfCancelled(signal);
		if (this.app.vault.getAbstractFileByPath(file.path) !== file) {
			throw new OutlinePasteError('target-changed', t('outline.targetFileMissing'));
		}

		const openView = this.findOpenMarkdownView(file);
		if (openView) {
			const documentText = openView.editor.getValue();
			const target = resolveOutlinePasteTextAnchor(documentText, anchor);
			if (!target) {
				throw new OutlinePasteError('target-changed', t('outline.targetChanged'));
			}

			const renderedMarkdown = renderOutlineNodes(nodes, target.rootInsertionPrefix);
			validateRenderedMarkdownSize(renderedMarkdown, maxOutputMarkdownBytes);
			this.throwIfCancelled(signal);
			const insertion = composeInsertion(documentText, target.insertOffset, renderedMarkdown);
			openView.editor.replaceRange(
				insertion.text,
				openView.editor.offsetToPos(target.insertOffset),
				openView.editor.offsetToPos(target.insertOffset),
				'block-reference-outline-paste',
			);
			return { editor: openView.editor, cursorOffset: insertion.cursorOffset };
		}

		let cursorOffset = 0;
		await this.app.vault.process(file, (documentText) => {
			this.throwIfCancelled(signal);
			const target = resolveOutlinePasteTextAnchor(documentText, anchor);
			if (!target) {
				throw new OutlinePasteError('target-changed', t('outline.targetChanged'));
			}

			const renderedMarkdown = renderOutlineNodes(nodes, target.rootInsertionPrefix);
			validateRenderedMarkdownSize(renderedMarkdown, maxOutputMarkdownBytes);
			const insertion = composeInsertion(documentText, target.insertOffset, renderedMarkdown);
			cursorOffset = insertion.cursorOffset;
			return `${documentText.slice(0, target.insertOffset)}${insertion.text}${documentText.slice(target.insertOffset)}`;
		});
		return { editor: null, cursorOffset };
	}

	private findOpenMarkdownView(file: TFile): MarkdownView | null {
		for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
			if (leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) {
				return leaf.view;
			}
		}

		return null;
	}

	private isEditorActiveForFile(editor: Editor, file: TFile): boolean {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		return activeView?.file?.path === file.path && activeView.editor === editor;
	}

	private throwIfCancelled(signal: AbortSignal) {
		if (signal.aborted) {
			throw new OutlinePasteError('cancelled', t('outline.cancelled'));
		}
	}
}

function validateRenderedMarkdownSize(renderedMarkdown: string, maxOutputMarkdownBytes: number) {
	if (new TextEncoder().encode(renderedMarkdown).length > maxOutputMarkdownBytes) {
		throw new OutlinePasteError('too-large', t('outline.outputTooLarge'));
	}
}

function composeInsertion(documentText: string, insertOffset: number, renderedMarkdown: string): { text: string; cursorOffset: number } {
	const needsLeadingNewline = insertOffset >= documentText.length
		? documentText.length > 0 && documentText[documentText.length - 1] !== '\n'
		: insertOffset > 0 && documentText[insertOffset - 1] !== '\n';
	const leadingNewline = needsLeadingNewline ? '\n' : '';
	const trailingNewline = insertOffset < documentText.length && !renderedMarkdown.endsWith('\n') ? '\n' : '';
	return {
		text: `${leadingNewline}${renderedMarkdown}${trailingNewline}`,
		cursorOffset: insertOffset + leadingNewline.length + (renderedMarkdown.match(/^([^\n]*)/)?.[1].length ?? 0),
	};
}

function isOutlinePasteCancelled(error: unknown): boolean {
	return error instanceof OutlinePasteError && error.code === 'cancelled';
}

function resolveOutlinePasteFailureMessage(error: unknown): string {
	if (error instanceof OutlinePasteError) {
		switch (error.code) {
			case 'empty':
				return t('outline.empty');
			case 'unsupported':
				return t('outline.unsupported');
			case 'too-large':
				return error.message;
			case 'timeout':
				return t('outline.timeout');
			case 'target-changed':
				return error.message;
			default:
				return error.message;
		}
	}

	return t('outline.failed');
}
