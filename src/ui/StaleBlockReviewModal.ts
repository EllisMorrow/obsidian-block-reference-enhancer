import { App, Modal, Setting } from 'obsidian';
import type BlockReferenceEnhancer from '../main';
import { t } from '../i18n';

export class StaleBlockReviewModal extends Modal {
    private readonly ignoredIds = new Set<string>();

    constructor(app: App, private readonly plugin: BlockReferenceEnhancer) {
        super(app);
    }

    onOpen() {
		this.setTitle(t('stale.title'));
        this.render();
    }

    onClose() {
        this.contentEl.empty();
    }

    private render() {
        this.contentEl.empty();

        const staleBlocks = this.plugin.indexService
            .getStaleBlocks()
            .filter((record) => !this.ignoredIds.has(record.id));

        if (staleBlocks.length === 0) {
            this.contentEl.createEl('p', {
				text: t('stale.none'),
            });
            return;
        }

        this.contentEl.createEl('p', {
			text: t('stale.count', { count: staleBlocks.length }),
        });

        for (const staleBlock of staleBlocks) {
			const summary = staleBlock.block.rawContent.split(/\r?\n/, 1)[0] || t('stale.emptyBlock');
            const container = this.contentEl.createDiv({ cls: 'block-reference-stale-review-item' });
            container.createEl('div', {
                text: summary,
                cls: 'block-reference-stale-review-summary',
            });
            container.createEl('div', {
                text: `${staleBlock.id}`,
                cls: 'block-reference-stale-review-meta',
            });
            container.createEl('div', {
				text: t('stale.meta', { path: staleBlock.block.filePath, count: staleBlock.references.length }),
                cls: 'block-reference-stale-review-meta',
            });

            const actionSetting = new Setting(container);
            actionSetting
                .addButton((button) => {
                    button
						.setButtonText(t('action.restoreRecoveryPage'))
                        .setCta()
                        .onClick(async () => {
                            this.setBusy(container, true);
                            await this.plugin.recoverBlockToRecoveryPage(staleBlock.id);
                            this.render();
                        });
                })
                .addButton((button) => {
                    button
                        .setWarning()
						.setButtonText(t('action.confirmDeletion'))
                        .onClick(async () => {
							const confirmed = window.confirm(t('stale.confirm'));
                            if (!confirmed) {
                                return;
                            }

                            this.setBusy(container, true);
                            await this.plugin.confirmBlockDeletion(staleBlock.id);
                            this.render();
                        });
                })
                .addButton((button) => {
                    button
						.setButtonText(t('action.ignoreForNow'))
                        .onClick(() => {
                            this.ignoredIds.add(staleBlock.id);
                            this.render();
                        });
                });
        }
    }

    private setBusy(container: HTMLElement, busy: boolean) {
        container.toggleClass('is-busy', busy);
    }
}
