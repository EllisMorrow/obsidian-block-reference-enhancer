import { t } from '../i18n';

export type PersistedEmbedFoldState = Record<string, string[]>;

export interface EmbedOccurrenceIdentity {
	filePath: string;
	line: number;
	ch: number;
	uuid: string;
}

type SaveFoldState = (state: PersistedEmbedFoldState) => Promise<void>;

const SAVE_DEBOUNCE_MS = 180;
const RUNTIME_OCCURRENCE_PREFIX = 'runtime:';
const ROOT_NODE_KEY = '$root';

export function createEmbedOccurrenceKey(identity: EmbedOccurrenceIdentity): string {
	return JSON.stringify([identity.filePath, identity.line, identity.ch, identity.uuid]);
}

export function parsePersistedEmbedFoldState(value: unknown): PersistedEmbedFoldState {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}

	const parsed: PersistedEmbedFoldState = {};
	for (const [occurrenceKey, nodeKeys] of Object.entries(value)) {
		if (!Array.isArray(nodeKeys)) {
			continue;
		}

		const validNodeKeys = [...new Set(nodeKeys.filter((nodeKey): nodeKey is string => typeof nodeKey === 'string' && nodeKey.length > 0))];
		if (validNodeKeys.length > 0) {
			parsed[occurrenceKey] = validNodeKeys;
		}
	}

	return parsed;
}

export class EmbedFoldStateService {
	private readonly collapsedByOccurrence = new Map<string, Set<string>>();
	private saveTimer: number | null = null;
	private runtimeOccurrenceSequence = 0;

	constructor(initialState: unknown, private readonly saveState: SaveFoldState) {
		const parsed = parsePersistedEmbedFoldState(initialState);
		for (const [occurrenceKey, nodeKeys] of Object.entries(parsed)) {
			this.collapsedByOccurrence.set(occurrenceKey, new Set(nodeKeys));
		}
	}

	dispose() {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
			void this.flush();
		}
	}

	enhance(container: HTMLElement, occurrenceKey: string | null) {
		this.clearManagedFolding(container);
		const resolvedOccurrenceKey = occurrenceKey ?? `${RUNTIME_OCCURRENCE_PREFIX}${++this.runtimeOccurrenceSequence}`;
		const persistent = occurrenceKey !== null;
		const collapsedNodeKeys = this.collapsedByOccurrence.get(resolvedOccurrenceKey) ?? new Set<string>();
		const availableNodeKeys = new Set<string>();
		this.enhanceEmbedRoot(container, resolvedOccurrenceKey, persistent, collapsedNodeKeys, availableNodeKeys);

		for (const rootList of this.findRootLists(container)) {
			this.enhanceList(rootList, '', resolvedOccurrenceKey, persistent, collapsedNodeKeys, availableNodeKeys);
		}

		if (!persistent) {
			return;
		}

		const validCollapsedNodeKeys = new Set([...collapsedNodeKeys].filter((nodeKey) => availableNodeKeys.has(nodeKey)));
		if (setsEqual(collapsedNodeKeys, validCollapsedNodeKeys)) {
			return;
		}

		this.replaceOccurrenceState(resolvedOccurrenceKey, validCollapsedNodeKeys);
		this.scheduleSave();
	}

	handleToggle(button: HTMLElement): boolean {
		const occurrenceKey = button.dataset.blockRefFoldOccurrence;
		const nodeKey = button.dataset.blockRefFoldNode;
		if (!occurrenceKey || !nodeKey) {
			return false;
		}

		const foldTargets = button.hasClass('block-reference-embed-root-fold-toggle')
			? this.findRootFoldTargets(button)
			: this.findListItemFoldTargets(button);
		if (foldTargets.length === 0) {
			return false;
		}

		const collapse = button.getAttribute('aria-expanded') !== 'false';
		this.applyCollapsedState(button, foldTargets, collapse);

		const collapsedNodeKeys = new Set(this.collapsedByOccurrence.get(occurrenceKey) ?? []);
		if (collapse) {
			collapsedNodeKeys.add(nodeKey);
		} else {
			collapsedNodeKeys.delete(nodeKey);
		}
		this.replaceOccurrenceState(occurrenceKey, collapsedNodeKeys);
		this.syncOccurrenceWithinDocument(button, occurrenceKey, collapsedNodeKeys);

		if (button.dataset.blockRefFoldPersistent === 'true') {
			this.scheduleSave();
		}
		return true;
	}

	private syncOccurrenceWithinDocument(
		sourceButton: HTMLElement,
		occurrenceKey: string,
		collapsedNodeKeys: ReadonlySet<string>,
	) {
		sourceButton.ownerDocument.querySelectorAll<HTMLElement>('.block-reference-embed-fold-toggle').forEach((button) => {
			if (button === sourceButton || button.dataset.blockRefFoldOccurrence !== occurrenceKey) {
				return;
			}

			const nodeKey = button.dataset.blockRefFoldNode;
			if (!nodeKey) {
				return;
			}

			const foldTargets = button.hasClass('block-reference-embed-root-fold-toggle')
				? this.findRootFoldTargets(button)
				: this.findListItemFoldTargets(button);
			if (foldTargets.length === 0) {
				return;
			}

			this.applyCollapsedState(button, foldTargets, collapsedNodeKeys.has(nodeKey));
		});
	}

	private enhanceEmbedRoot(
		container: HTMLElement,
		occurrenceKey: string,
		persistent: boolean,
		collapsedNodeKeys: ReadonlySet<string>,
		availableNodeKeys: Set<string>,
	) {
		const rootContainer = directChildWithClass(container, 'block-reference-embed-root');
		const childrenContainer = directChildWithClass(container, 'block-reference-embed-children');
		if (!rootContainer || !childrenContainer || !childrenContainer.hasChildNodes()) {
			return;
		}

		availableNodeKeys.add(ROOT_NODE_KEY);
		rootContainer.addClass('block-reference-embed-root-foldable');
		const button = this.createToggleButton(rootContainer.ownerDocument, occurrenceKey, ROOT_NODE_KEY, persistent);
		button.addClass('block-reference-embed-root-fold-toggle');
		rootContainer.insertBefore(button, rootContainer.firstChild);
		this.applyCollapsedState(button, [childrenContainer], collapsedNodeKeys.has(ROOT_NODE_KEY));
	}

	reconcileOccurrences(validOccurrenceKeys: ReadonlySet<string>) {
		let changed = false;
		for (const occurrenceKey of [...this.collapsedByOccurrence.keys()]) {
			if (occurrenceKey.startsWith(RUNTIME_OCCURRENCE_PREFIX) || validOccurrenceKeys.has(occurrenceKey)) {
				continue;
			}

			this.collapsedByOccurrence.delete(occurrenceKey);
			changed = true;
		}

		if (changed) {
			this.scheduleSave();
		}
	}

	private enhanceList(
		list: HTMLElement,
		parentNodeKey: string,
		occurrenceKey: string,
		persistent: boolean,
		collapsedNodeKeys: ReadonlySet<string>,
		availableNodeKeys: Set<string>,
	) {
		const siblingCounts = new Map<string, number>();
		for (const listItem of directListItems(list)) {
			const ownText = readListItemOwnText(listItem);
			const textHash = hashText(ownText || '[empty]');
			const duplicateIndex = siblingCounts.get(textHash) ?? 0;
			siblingCounts.set(textHash, duplicateIndex + 1);
			const nodeKey = parentNodeKey ? `${parentNodeKey}/${textHash}:${duplicateIndex}` : `${textHash}:${duplicateIndex}`;
			const childLists = directChildLists(listItem);

			if (childLists.length > 0) {
				availableNodeKeys.add(nodeKey);
				const button = this.createToggleButton(listItem.ownerDocument, occurrenceKey, nodeKey, persistent);
				listItem.addClass('block-reference-foldable-item');
				listItem.insertBefore(button, listItem.firstChild);
				this.applyCollapsedState(button, childLists, collapsedNodeKeys.has(nodeKey));
			}

			for (const childList of childLists) {
				this.enhanceList(childList, nodeKey, occurrenceKey, persistent, collapsedNodeKeys, availableNodeKeys);
			}
		}
	}

	private createToggleButton(document: Document, occurrenceKey: string, nodeKey: string, persistent: boolean): HTMLButtonElement {
		const button = document.createElement('button');
		button.type = 'button';
		button.addClass('block-reference-embed-fold-toggle');
		button.dataset.blockRefFoldOccurrence = occurrenceKey;
		button.dataset.blockRefFoldNode = nodeKey;
		button.dataset.blockRefFoldPersistent = String(persistent);
		return button;
	}

	private applyCollapsedState(button: HTMLElement, childLists: HTMLElement[], collapsed: boolean) {
		button.setAttribute('aria-expanded', String(!collapsed));
		button.setAttribute('aria-label', collapsed ? t('aria.expandEmbedOutline') : t('aria.collapseEmbedOutline'));
		button.toggleClass('is-collapsed', collapsed);
		for (const childList of childLists) {
			childList.dataset.blockRefFoldManaged = 'true';
			childList.hidden = collapsed;
		}
	}

	private findRootLists(container: HTMLElement): HTMLElement[] {
		return Array.from(container.querySelectorAll<HTMLElement>('ul, ol')).filter((list) => {
			const parentListItem = list.parentElement?.closest('li');
			return !parentListItem || !container.contains(parentListItem);
		});
	}

	private clearManagedFolding(container: HTMLElement) {
		container.querySelectorAll('.block-reference-embed-fold-toggle').forEach((button) => button.remove());
		container.querySelectorAll('.block-reference-foldable-item').forEach((item) => item.removeClass('block-reference-foldable-item'));
		container.querySelectorAll('.block-reference-embed-root-foldable').forEach((item) => item.removeClass('block-reference-embed-root-foldable'));
		container.querySelectorAll<HTMLElement>('[data-block-ref-fold-managed="true"]').forEach((list) => {
			list.hidden = false;
			delete list.dataset.blockRefFoldManaged;
		});
	}

	private findRootFoldTargets(button: HTMLElement): HTMLElement[] {
		const rootContainer = button.closest('.block-reference-embed-root');
		const embedContainer = rootContainer?.parentElement;
		if (!isHtmlElement(embedContainer)) {
			return [];
		}

		const childrenContainer = directChildWithClass(embedContainer, 'block-reference-embed-children');
		return childrenContainer ? [childrenContainer] : [];
	}

	private findListItemFoldTargets(button: HTMLElement): HTMLElement[] {
		const listItem = button.closest('li');
		return isHtmlElement(listItem) ? directChildLists(listItem) : [];
	}

	private replaceOccurrenceState(occurrenceKey: string, nodeKeys: Set<string>) {
		if (nodeKeys.size === 0) {
			this.collapsedByOccurrence.delete(occurrenceKey);
			return;
		}

		this.collapsedByOccurrence.set(occurrenceKey, nodeKeys);
	}

	private scheduleSave() {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
		}
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.flush();
		}, SAVE_DEBOUNCE_MS);
	}

	private async flush() {
		const persisted: PersistedEmbedFoldState = {};
		for (const [occurrenceKey, nodeKeys] of this.collapsedByOccurrence.entries()) {
			if (occurrenceKey.startsWith(RUNTIME_OCCURRENCE_PREFIX) || nodeKeys.size === 0) {
				continue;
			}

			persisted[occurrenceKey] = [...nodeKeys].sort();
		}
		await this.saveState(persisted);
	}
}

function directListItems(list: HTMLElement): HTMLLIElement[] {
	return Array.from(list.children).filter((child): child is HTMLLIElement => child.tagName === 'LI');
}

function directChildLists(listItem: HTMLElement): HTMLElement[] {
	return Array.from(listItem.children).filter((child): child is HTMLElement => child.tagName === 'UL' || child.tagName === 'OL');
}

function directChildWithClass(container: HTMLElement, className: string): HTMLElement | null {
	for (const child of Array.from(container.children)) {
		if (isHtmlElement(child) && child.hasClass(className)) {
			return child;
		}
	}
	return null;
}

function readListItemOwnText(listItem: HTMLLIElement): string {
	const parts: string[] = [];
	for (const child of Array.from(listItem.childNodes)) {
		if (isHtmlElement(child) && (child.matches('ul, ol') || child.hasClass('block-reference-embed-fold-toggle'))) {
			continue;
		}

		parts.push(child.textContent ?? '');
	}

	return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function hashText(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
	if (left.size !== right.size) {
		return false;
	}
	for (const value of left) {
		if (!right.has(value)) {
			return false;
		}
	}
	return true;
}
import { isHtmlElement } from '../utils/dom';
