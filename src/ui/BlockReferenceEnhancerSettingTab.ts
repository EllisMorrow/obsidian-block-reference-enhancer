import { App, PluginSettingTab, Setting } from 'obsidian';
import type BlockReferenceEnhancer from '../main';
import { DEFAULT_HIDDEN_LOGSEQ_PROPERTY_KEYS } from '../services/LogseqPropertyMatcher';
import { getDocument } from '../utils/dom';
import { DEFAULT_DUAL_PROPERTY_WHITELIST, parseDualPropertyRules } from '../dual-property-sync/rules';

const SETTINGS_SAVE_DEBOUNCE_MS = 250;

export class BlockReferenceEnhancerSettingTab extends PluginSettingTab {
	private saveTimer: number | null = null;
	private saveRequiresRefresh = false;

	constructor(app: App, private readonly plugin: BlockReferenceEnhancer) {
		super(app, plugin);
	}

	hide() {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
			const refresh = this.saveRequiresRefresh;
			this.saveRequiresRefresh = false;
			void this.plugin.saveSettings(refresh);
		}
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();
		const doc = getDocument(containerEl);

		new Setting(containerEl)
			.setName('Property hiding')
			.setHeading();

		new Setting(containerEl)
			.setName('Hide Logseq-style property lines')
			.setDesc('Only hides matching key:: value property lines under unordered-list blocks in Obsidian. Markdown files are not modified.')
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.hideLogseqProperties)
					.onChange(async (value) => {
						this.plugin.settings.hideLogseqProperties = value;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		new Setting(containerEl)
			.setName('Hidden property keys')
			.setDesc(this.createRulesDescription(doc))
			.addTextArea((textArea) => {
				textArea
					.setValue(this.plugin.settings.hiddenLogseqPropertyKeys)
					.setPlaceholder(DEFAULT_HIDDEN_LOGSEQ_PROPERTY_KEYS)
					.onChange((value) => {
						this.plugin.settings.hiddenLogseqPropertyKeys = value;
						this.scheduleSave();
					});
				textArea.inputEl.rows = 8;
				textArea.inputEl.cols = 40;
				textArea.inputEl.addClass('block-reference-hidden-property-rules-input');
				textArea.setDisabled(!this.plugin.settings.hideLogseqProperties);
			})
			.addExtraButton((button) => {
				button
					.setIcon('reset')
					.setTooltip('Reset to defaults')
					.onClick(async () => {
						this.plugin.settings.hiddenLogseqPropertyKeys = DEFAULT_HIDDEN_LOGSEQ_PROPERTY_KEYS;
						await this.plugin.saveSettings();
						this.display();
					});
				button.setDisabled(!this.plugin.settings.hideLogseqProperties);
			});

		new Setting(containerEl)
			.setName('Experimental')
			.setHeading();

		new Setting(containerEl)
			.setName('Convert pasted content to outline')
			.setDesc('Adds right-click menu actions on unordered-list blocks, including empty ones. It can paste clipboard HTML or text as child outline blocks without changing normal paste behavior.')
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.enablePasteClipboardAsOutline)
					.onChange(async (value) => {
						this.plugin.settings.enablePasteClipboardAsOutline = value;
						await this.plugin.saveSettings(false);
					});
			});

		new Setting(containerEl)
			.setName('Logseq ↔ Obsidian page properties (Experimental)')
			.setHeading();

		new Setting(containerEl)
			.setName('Keep Logseq and Obsidian page properties in sync')
			.setDesc('Maintain whitelisted page properties in both Logseq key:: value format and Obsidian YAML frontmatter. Only enabled files and whitelisted properties are changed. Back up your vault before using batch operations.')
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.enableDualPagePropertySync)
					.onChange(async (value) => {
						this.plugin.settings.enableDualPagePropertySync = value;
						await this.plugin.saveSettings(false);
						this.display();
					});
			});

		new Setting(containerEl)
			.setName('Property sync whitelist')
			.setDesc(this.createDualPropertyWhitelistDescription(doc))
			.addTextArea((textArea) => {
				textArea
					.setValue(this.plugin.settings.dualPagePropertyWhitelist)
					.setPlaceholder(DEFAULT_DUAL_PROPERTY_WHITELIST)
					.setDisabled(!this.plugin.settings.enableDualPagePropertySync)
					.onChange((value) => {
						this.plugin.settings.dualPagePropertyWhitelist = value;
						this.scheduleSave(false);
					});
				textArea.inputEl.rows = 5;
				textArea.inputEl.cols = 40;
			})
			.addExtraButton((button) => {
				button
					.setIcon('reset')
					.setTooltip('Reset to defaults')
					.setDisabled(!this.plugin.settings.enableDualPagePropertySync)
					.onClick(async () => {
						this.plugin.settings.dualPagePropertyWhitelist = DEFAULT_DUAL_PROPERTY_WHITELIST;
						await this.plugin.saveSettings(false);
						this.display();
					});
			});

		const parsedRules = parseDualPropertyRules(this.plugin.settings.dualPagePropertyWhitelist);
		if (parsedRules.errors.length > 0) {
			new Setting(containerEl)
				.setName('Whitelist needs attention')
				.setDesc(parsedRules.errors.join(' '));
		}

		new Setting(containerEl)
			.setName('Selected folders')
			.setDesc('One vault-relative folder per line. Subfolders are included. Use . for the whole vault. Folder scans only start when you click the batch action.')
			.addTextArea((textArea) => {
				textArea
					.setValue(this.plugin.settings.dualPagePropertyFolders)
					.setPlaceholder('pages\nprojects/archive')
					.setDisabled(!this.plugin.settings.enableDualPagePropertySync)
					.onChange((value) => {
						this.plugin.settings.dualPagePropertyFolders = value;
						this.scheduleSave(false);
					});
				textArea.inputEl.rows = 5;
				textArea.inputEl.cols = 40;
			});

		new Setting(containerEl)
			.setName('Sync current file')
			.setDesc('Synchronize only the active Markdown file. If both formats changed, you will be asked which side to keep.')
			.addButton((button) => button
				.setButtonText('Sync current file')
				.setDisabled(!this.plugin.settings.enableDualPagePropertySync || parsedRules.errors.length > 0)
				.onClick(() => void this.plugin.syncDualPagePropertiesCurrentFile()));

		new Setting(containerEl)
			.setName('Selected folder batch sync')
			.setDesc('Scans selected folders first, shows a summary, and writes only after confirmation. Files changed after the scan are skipped.')
			.addButton((button) => button
				.setButtonText('Scan and sync selected folders…')
				.setCta()
				.setDisabled(!this.plugin.settings.enableDualPagePropertySync || parsedRules.errors.length > 0)
				.onClick(() => void this.plugin.scanAndSyncDualPagePropertyFolders()));

		new Setting(containerEl)
			.setName('Return to Logseq-only page properties')
			.setHeading();

		new Setting(containerEl)
			.setName('Remove Obsidian YAML and disable sync')
			.setDesc('Removes YAML only when every YAML value is represented equivalently by Logseq page properties. Unsafe files are skipped and reported. The sync feature is disabled afterward.')
			.addButton((button) => button
				.setButtonText('Remove safe YAML and disable sync…')
				.setWarning()
				.setDisabled(!this.plugin.settings.enableDualPagePropertySync || parsedRules.errors.length > 0)
				.onClick(() => void this.plugin.returnDualPagePropertyFoldersToLogseqOnly()));
	}

	private scheduleSave(refreshViews = true) {
		this.saveRequiresRefresh = this.saveRequiresRefresh || refreshViews;
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
		}

		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			const refresh = this.saveRequiresRefresh;
			this.saveRequiresRefresh = false;
			void this.plugin.saveSettings(refresh);
		}, SETTINGS_SAVE_DEBOUNCE_MS);
	}

	private createRulesDescription(doc: Document): DocumentFragment {
		const fragment = doc.createDocumentFragment();
		fragment.append('Use ');
		fragment.appendChild(this.createInlineCode(doc, '\\\\'));
		fragment.append(' as the separator between rules.');
		fragment.appendChild(doc.createElement('br'));
		fragment.append('Examples in notes: ');
		fragment.appendChild(this.createInlineCode(doc, 'hl:: value'));
		fragment.append(' hides only the exact key ');
		fragment.appendChild(this.createInlineCode(doc, 'hl'));
		fragment.append('. ');
		fragment.appendChild(this.createInlineCode(doc, 'hl-*:: value'));
		fragment.append(' hides any key that starts with ');
		fragment.appendChild(this.createInlineCode(doc, 'hl-'));
		fragment.append('. In the setting box, write only the key rules themselves, for example ');
		fragment.appendChild(this.createInlineCode(doc, 'collapsed\\\\id\\\\hl-*'));
		fragment.append('.');
		return fragment;
	}

	private createInlineCode(doc: Document, text: string): HTMLElement {
		const code = doc.createElement('code');
		code.textContent = text;
		return code;
	}

	private createDualPropertyWhitelistDescription(doc: Document): DocumentFragment {
		const fragment = doc.createDocumentFragment();
		fragment.append('Use one rule per line. ');
		fragment.appendChild(this.createInlineCode(doc, 'alias<->aliases'));
		fragment.append(' maps a Logseq key to a differently named YAML key. ');
		fragment.appendChild(this.createInlineCode(doc, 'tags'));
		fragment.append(' uses the same key on both sides. Only the built-in alias mapping supports lists; custom rules support string values only. Block-only keys such as id and collapsed are protected.');
		return fragment;
	}
}
