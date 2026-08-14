import { editorInfoField } from 'obsidian';
import type { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import type BlockReferenceEnhancer from '../main';
import { isDomNode, isHtmlElement } from '../utils/dom';
import {
	registerEditorContextMenuCapture,
	resolveEditorContextMenuLine,
} from './EditorContextMenuCapturePolicy';

export interface EditorContextMenuTarget {
	filePath: string;
	line: number;
	capturedAt: number;
}

export function createEditorContextMenuTargetPlugin(plugin: BlockReferenceEnhancer): Extension {
	return ViewPlugin.fromClass(
		class {
			private readonly unregisterContextMenuCapture: () => void;

			constructor(readonly view: EditorView) {
				this.unregisterContextMenuCapture = registerEditorContextMenuCapture(
					view.dom,
					(event) => this.captureContextMenuTarget(event),
				);
			}

			destroy() {
				this.unregisterContextMenuCapture();
			}

			private captureContextMenuTarget(event: MouseEvent) {
				plugin.clearEditorContextMenuTarget();
				const filePath = this.view.state.field(editorInfoField).file?.path;
				if (!filePath) {
					return;
				}

				const line = resolveContextMenuLineFromView(this.view, event);
				if (line === null) {
					return;
				}

				plugin.setEditorContextMenuTarget({
					filePath,
					line,
					capturedAt: Date.now(),
				});
			}
		},
	);
}

function resolveContextMenuLineFromView(view: EditorView, event: MouseEvent): number | null {
	const resolveDomPosition = (): number | null => {
		const target = event.target;
		if (!isDomNode(target) || !view.dom.contains(target)) {
			return null;
		}

		const targetElement = isHtmlElement(target) ? target : target.parentElement;
		const renderedHost = targetElement?.closest('[data-block-ref-from]');
		if (isHtmlElement(renderedHost) && view.dom.contains(renderedHost)) {
			const rawPosition = renderedHost.dataset.blockRefFrom;
			return rawPosition && rawPosition.trim() ? Number(rawPosition) : null;
		}

		const lineElement = targetElement?.closest('.cm-line');
		if (isHtmlElement(lineElement) && view.contentDOM.contains(lineElement)) {
			return view.posAtDOM(lineElement, 0);
		}

		return null;
	};

	return resolveEditorContextMenuLine(view.state.doc, [
		resolveDomPosition,
		// A fold gutter/marker has no cm-line ancestor. Its vertical block is
		// more reliable than projecting its left-of-content x coordinate.
		() => view.lineBlockAtHeight(event.clientY - view.documentTop).from,
		() => view.posAtCoords({ x: event.clientX, y: event.clientY }, false),
	]);
}
