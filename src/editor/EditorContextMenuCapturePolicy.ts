export interface EditorContextMenuDocumentLike {
	readonly length: number;
	readonly lines: number;
	lineAt(position: number): { number: number };
}

export type EditorContextMenuPositionStrategy = () => number | null | undefined;

/**
 * Resolve the first valid document line without letting a failed DOM/geometry
 * strategy prevent the remaining fallbacks from running.
 */
export function resolveEditorContextMenuLine(
	document: EditorContextMenuDocumentLike,
	positionStrategies: readonly EditorContextMenuPositionStrategy[],
): number | null {
	for (const resolvePosition of positionStrategies) {
		let position: number | null | undefined;
		try {
			position = resolvePosition();
		} catch {
			continue;
		}

		if (typeof position !== 'number' || !Number.isFinite(position) || position < 0 || position > document.length) {
			continue;
		}

		try {
			const line = document.lineAt(position).number - 1;
			if (line >= 0 && line < document.lines) {
				return line;
			}
		} catch {
			// Continue to the next strategy when the document rejects a position.
		}
	}

	return null;
}

/**
 * CodeMirror's ViewPlugin event handlers are filtered through WidgetType.ignoreEvent.
 * A native capture listener runs before that filter and still sees native fold markers.
 */
export function registerEditorContextMenuCapture(
	target: Pick<HTMLElement, 'addEventListener' | 'removeEventListener'>,
	listener: (event: MouseEvent) => void,
): () => void {
	target.addEventListener('contextmenu', listener, true);
	return () => target.removeEventListener('contextmenu', listener, true);
}
