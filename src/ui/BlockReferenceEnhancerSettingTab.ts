import { App, PluginSettingTab, Setting } from 'obsidian';
import type BlockReferenceEnhancer from '../main';
import { DEFAULT_HIDDEN_LOGSEQ_PROPERTY_KEYS } from '../services/LogseqPropertyMatcher';
import { getDocument } from '../utils/dom';
import { DEFAULT_DUAL_PROPERTY_WHITELIST, parseDualPropertyRules } from '../dual-property-sync/rules';
import { t } from '../i18n';

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
			.setName(t('settings.propertyHiding.heading'))
			.setHeading();

		new Setting(containerEl)
			.setName(t('settings.propertyHiding.name'))
			.setDesc(t('settings.propertyHiding.desc'))
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
			.setName(t('settings.hiddenKeys.name'))
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
					.setTooltip(t('settings.reset'))
					.onClick(async () => {
						this.plugin.settings.hiddenLogseqPropertyKeys = DEFAULT_HIDDEN_LOGSEQ_PROPERTY_KEYS;
						await this.plugin.saveSettings();
						this.display();
					});
				button.setDisabled(!this.plugin.settings.hideLogseqProperties);
			});

		new Setting(containerEl)
			.setName(t('settings.experimental.heading'))
			.setHeading();

		new Setting(containerEl)
			.setName(t('settings.outlinePaste.name'))
			.setDesc(t('settings.outlinePaste.desc'))
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.enablePasteClipboardAsOutline)
					.onChange(async (value) => {
						this.plugin.settings.enablePasteClipboardAsOutline = value;
						await this.plugin.saveSettings(false);
					});
			});

		new Setting(containerEl)
			.setName(t('settings.propertySync.heading'))
			.setHeading();

		new Setting(containerEl)
			.setName(t('settings.propertySync.name'))
			.setDesc(t('settings.propertySync.desc'))
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
			.setName(t('settings.whitelist.name'))
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
					.setTooltip(t('settings.reset'))
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
				.setName(t('settings.whitelist.warning'))
				.setDesc(parsedRules.errors.join(' '));
		}

		new Setting(containerEl)
			.setName(t('settings.folders.name'))
			.setDesc(t('settings.folders.desc'))
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
			.setName(t('settings.syncCurrent.name'))
			.setDesc(t('settings.syncCurrent.desc'))
			.addButton((button) => button
				.setButtonText(t('settings.syncCurrent.name'))
				.setDisabled(!this.plugin.settings.enableDualPagePropertySync || parsedRules.errors.length > 0)
				.onClick(() => void this.plugin.syncDualPagePropertiesCurrentFile()));

		new Setting(containerEl)
			.setName(t('settings.syncFolders.name'))
			.setDesc(t('settings.syncFolders.desc'))
			.addButton((button) => button
				.setButtonText(t('settings.syncFolders.button'))
				.setCta()
				.setDisabled(!this.plugin.settings.enableDualPagePropertySync || parsedRules.errors.length > 0)
				.onClick(() => void this.plugin.scanAndSyncDualPagePropertyFolders()));

		new Setting(containerEl)
			.setName(t('settings.logseqOnly.heading'))
			.setHeading();

		new Setting(containerEl)
			.setName(t('settings.logseqOnly.name'))
			.setDesc(t('settings.logseqOnly.desc'))
			.addButton((button) => button
				.setButtonText(t('settings.logseqOnly.button'))
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
		fragment.append(t('settings.hiddenRules.beforeSeparator'));
		fragment.appendChild(this.createInlineCode(doc, '\\\\'));
		fragment.append(t('settings.hiddenRules.afterSeparator'));
		fragment.appendChild(doc.createElement('br'));
		fragment.append(t('settings.hiddenRules.examples'));
		fragment.appendChild(this.createInlineCode(doc, 'hl:: value'));
		fragment.append(t('settings.hiddenRules.exactBefore'));
		fragment.appendChild(this.createInlineCode(doc, 'hl'));
		fragment.append(t('settings.hiddenRules.exactAfter'));
		fragment.appendChild(this.createInlineCode(doc, 'hl-*:: value'));
		fragment.append(t('settings.hiddenRules.prefixBefore'));
		fragment.appendChild(this.createInlineCode(doc, 'hl-'));
		fragment.append(t('settings.hiddenRules.prefixAfter'));
		fragment.append(t('settings.hiddenRules.boxBefore'));
		fragment.appendChild(this.createInlineCode(doc, 'collapsed\\\\id\\\\hl-*'));
		fragment.append(t('settings.hiddenRules.boxAfter'));
		return fragment;
	}

	private createInlineCode(doc: Document, text: string): HTMLElement {
		const code = doc.createElement('code');
		code.textContent = text;
		return code;
	}

	private createDualPropertyWhitelistDescription(doc: Document): DocumentFragment {
		const fragment = doc.createDocumentFragment();
		fragment.append(t('settings.whitelist.beforeMapping'));
		fragment.appendChild(this.createInlineCode(doc, 'alias<->aliases'));
		fragment.append(t('settings.whitelist.afterMapping'));
		fragment.appendChild(this.createInlineCode(doc, 'tags'));
		fragment.append(t('settings.whitelist.sameKeyBefore'));
		return fragment;
	}
}
