export function shouldIgnoreBlockReferenceWidgetEvent(
	mode: 'inline' | 'embed',
	eventType: string,
): boolean {
	if (eventType === 'contextmenu') {
		return false;
	}

	return mode !== 'embed' || eventType !== 'mousedown';
}
