import { EditorView, WidgetType } from "@codemirror/view";
import { createBlockReferenceActionButtonsElement } from "src/ui/BlockReferenceActionButtonsElement";
import { replaceChildrenFromHtml } from "src/utils/html";
import { measureWidgetCoords } from "src/utils/widgetCoords";
import { t } from "src/i18n";
import type { BlockReferenceRenderSegment } from "src/services/BlockImageExtraction";
import { createBlockReferenceImageElement, settleBlockReferenceImageElement } from "src/ui/BlockReferenceImageElement";
import { shouldIgnoreBlockReferenceWidgetEvent } from "./BlockReferenceWidgetEventPolicy";

export type BlockRenderMode = "inline" | "embed";
export interface BlockWidgetInteraction {
    from: number;
    to: number;
    revealPos: number;
    stale?: boolean;
    blockWidget?: boolean;
    preserveListMarker?: boolean;
    availableInlineWidthPx?: number;
    listPrefixColumns?: number;
    listMarkerOffsetPx?: number;
    listContentOffsetPx?: number;
    cardPos?: number;
    refId?: string;
    sourceBlockId?: string;
    signature?: string;
    lineHeightPx?: number;
    reservedHeightPx?: number;
    segments?: BlockReferenceRenderSegment[];
    onImageSettled?: () => void;
}

function renderSegmentsEqual(
    left?: readonly BlockReferenceRenderSegment[],
    right?: readonly BlockReferenceRenderSegment[],
): boolean {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }

    return left.every((segment, index) => {
        const other = right[index];
        if (segment.type !== other.type) {
            return false;
        }
        if (segment.type === "text" && other.type === "text") {
            return segment.text === other.text;
        }
        if (segment.type === "image" && other.type === "image") {
            return segment.image.src === other.image.src
                && segment.image.alt === other.image.alt
                && segment.image.width === other.image.width
                && segment.image.height === other.image.height;
        }
        return false;
    });
}

/**
 * 这是一个纯粹的“视图”组件。
 * 它只根据传入的状态来决定自己应该显示什么，不包含任何异步逻辑。
 */
export class BlockReferenceWidget extends WidgetType {
    private imageObserverCleanup: (() => void) | null = null;

    constructor(
        readonly state: "loading" | "rendered",
        readonly mode: BlockRenderMode,
        readonly content?: string,
        readonly interaction?: BlockWidgetInteraction
    ) {
        super();
    }

    eq(other: BlockReferenceWidget): boolean {
        // 只有当状态和内容都完全相同时，才认为两个 Widget 相等，以避免不必要的重绘
        return this.state === other.state
            && this.mode === other.mode
            && this.content === other.content
            && this.interaction?.from === other.interaction?.from
            && this.interaction?.to === other.interaction?.to
            && this.interaction?.revealPos === other.interaction?.revealPos
            && this.interaction?.stale === other.interaction?.stale
            && this.interaction?.blockWidget === other.interaction?.blockWidget
            && this.interaction?.preserveListMarker === other.interaction?.preserveListMarker
            && this.interaction?.availableInlineWidthPx === other.interaction?.availableInlineWidthPx
            && this.interaction?.listPrefixColumns === other.interaction?.listPrefixColumns
            && this.interaction?.listMarkerOffsetPx === other.interaction?.listMarkerOffsetPx
            && this.interaction?.listContentOffsetPx === other.interaction?.listContentOffsetPx
            && this.interaction?.cardPos === other.interaction?.cardPos
            && this.interaction?.refId === other.interaction?.refId
            && this.interaction?.sourceBlockId === other.interaction?.sourceBlockId
            && this.interaction?.signature === other.interaction?.signature
            && this.interaction?.lineHeightPx === other.interaction?.lineHeightPx
            && this.interaction?.reservedHeightPx === other.interaction?.reservedHeightPx
            && renderSegmentsEqual(this.interaction?.segments, other.interaction?.segments);
    }

    ignoreEvent(event: Event): boolean {
        // The context-menu target plugin must see right-clicks that originate
        // inside a rendered widget. Otherwise it reuses a stale editor line and
        // block actions can write an id to the wrong list item.
        return shouldIgnoreBlockReferenceWidgetEvent(this.mode, event.type);
    }

    coordsAt(dom: HTMLElement, pos: number, side: number) {
        return measureWidgetCoords(dom, pos, side);
    }

    private applyReferenceDatasets(container: HTMLElement) {
        if (!this.interaction) {
            return;
        }

        container.dataset.blockRefFrom = String(this.interaction.from);
        container.dataset.blockRefTo = String(this.interaction.to);
        container.dataset.blockRefRevealPos = String(this.interaction.revealPos);

        if (this.interaction.refId) {
            container.dataset.blockRefId = this.interaction.refId;
        }

        if (this.interaction.sourceBlockId) {
            container.dataset.blockRefSourceId = this.interaction.sourceBlockId;
        }
    }

    private createEmbedCard(doc: Document, isBlockWidget: boolean, isListCard: boolean): HTMLElement {
        const card = doc.createElement("div");
        const usesMeasuredListLayout = this.interaction?.listMarkerOffsetPx !== undefined
            && this.interaction?.listContentOffsetPx !== undefined;
        const preservesListMarker = this.interaction?.preserveListMarker === true;
        card.className = `block-reference-enhancer-widget block-reference-embed-widget markdown-rendered${isBlockWidget ? "" : " is-inline-embed"}${isListCard ? " is-list-embed-card" : ""}${usesMeasuredListLayout ? " is-measured-list-embed" : ""}${preservesListMarker ? " is-list-inline-embed" : ""}`;
        this.applyReferenceDatasets(card);

        if (this.interaction) {
            if (this.interaction.stale) {
                card.addClass("is-stale");
                card.setAttribute("title", t('render.staleBlock'));
            }

            if (this.interaction.availableInlineWidthPx !== undefined) {
                card.style.setProperty("--block-reference-inline-available-width-px", `${this.interaction.availableInlineWidthPx}px`);
            }

            if (this.interaction.listPrefixColumns !== undefined) {
                card.style.setProperty("--block-reference-list-prefix-columns", `${this.interaction.listPrefixColumns}ch`);
            }

            if (this.interaction.listMarkerOffsetPx !== undefined) {
                card.style.setProperty("--block-reference-list-marker-offset-px", `${this.interaction.listMarkerOffsetPx}px`);
            }

            if (this.interaction.listContentOffsetPx !== undefined) {
                card.style.setProperty("--block-reference-list-content-offset-px", `${this.interaction.listContentOffsetPx}px`);
            }

            if (this.interaction.lineHeightPx !== undefined) {
                card.style.setProperty("--block-reference-line-height-px", `${this.interaction.lineHeightPx}px`);
            }
        }

        if (this.mode === "embed" && usesMeasuredListLayout && !preservesListMarker) {
            const layout = doc.createElement("div");
            layout.className = "block-reference-live-preview-list-embed";

            const marker = doc.createElement("span");
            marker.className = "block-reference-live-preview-list-marker";
            marker.setAttribute("aria-hidden", "true");

            const embed = doc.createElement("div");
            embed.className = "block-reference-embed block-reference-live-preview-embed-card";

            if (this.state === "loading") {
                embed.setText(t('render.loadingBlock'));
                card.addClass("is-loading");
            } else if (this.state === "rendered" && this.content) {
                replaceChildrenFromHtml(embed, this.content);
            } else {
                embed.setText(t('render.invalidState'));
                card.addClass("is-error");
            }

            layout.append(marker, embed);
            card.appendChild(layout);
            if (this.interaction?.sourceBlockId) {
                card.appendChild(createBlockReferenceActionButtonsElement(this.interaction.sourceBlockId, doc));
            }
            return card;
        }

        if (this.state === "loading") {
            const reservedHeight = Math.max(this.interaction?.reservedHeightPx ?? 0, 0);
            if (reservedHeight > 0) {
                card.style.minHeight = `${reservedHeight}px`;
            }
            card.setText(this.mode === "embed" ? t('render.loadingBlock') : t('render.loading'));
            card.addClass("is-loading");
        } else if (this.state === "rendered" && this.content) {
            if (this.mode === "embed") {
                replaceChildrenFromHtml(card, this.content);
            } else {
                card.setText(this.content);
            }
        } else {
            card.setText(t('render.invalidState'));
            card.addClass("is-error");
        }

        if (this.interaction?.sourceBlockId) {
            card.appendChild(createBlockReferenceActionButtonsElement(this.interaction.sourceBlockId, doc));
        }

        return card;
    }

    private createListEmbedSpacer(doc: Document): HTMLElement {
        const spacer = doc.createElement("div");
        spacer.className = "block-reference-embed-spacer";
        const reservedHeight = Math.max(this.interaction?.reservedHeightPx ?? 0, 0);
        spacer.style.height = `${reservedHeight}px`;
        return spacer;
    }

    private observeImages(container: HTMLElement, view: EditorView) {
        this.imageObserverCleanup?.();
        this.imageObserverCleanup = null;

        const images = Array.from(container.querySelectorAll("img"));
        if (images.length === 0) {
            return;
        }

        const win = container.ownerDocument.defaultView;
        let disposed = false;
        let measureScheduled = false;
        let frameId: number | null = null;
        const listeners = new Map<HTMLImageElement, () => void>();
        const cleanup = () => {
            if (disposed) {
                return;
            }
            disposed = true;
            if (frameId !== null && win) {
                win.cancelAnimationFrame(frameId);
                frameId = null;
            }
            for (const [image, listener] of listeners.entries()) {
                image.removeEventListener("load", listener);
                image.removeEventListener("error", listener);
            }
            listeners.clear();
        };
        const scheduleMeasure = () => {
            if (disposed || measureScheduled) {
                return;
            }

            measureScheduled = true;
            const measure = () => {
                frameId = null;
                measureScheduled = false;
                if (disposed || !view.dom.isConnected || !container.isConnected) {
                    return;
                }

                if (this.interaction?.onImageSettled) {
                    this.interaction.onImageSettled();
                } else {
                    view.requestMeasure();
                }
            };

            if (win?.requestAnimationFrame) {
                frameId = win.requestAnimationFrame(measure);
            } else {
                measure();
            }
        };

        for (const image of images) {
            if (image.complete) {
                settleBlockReferenceImageElement(image);
                scheduleMeasure();
                continue;
            }

            const onSettled = () => {
                image.removeEventListener("load", onSettled);
                image.removeEventListener("error", onSettled);
                listeners.delete(image);
                settleBlockReferenceImageElement(image);
                scheduleMeasure();
            };
            listeners.set(image, onSettled);
            image.addEventListener("load", onSettled, { once: true });
            image.addEventListener("error", onSettled, { once: true });
        }

        // The stable frame itself can change the line height before the image
        // starts loading. Measure once now, then again after load/error.
        scheduleMeasure();
        this.imageObserverCleanup = cleanup;
    }

    toDOM(view: EditorView): HTMLElement {
        const doc = view.contentDOM.ownerDocument;
        const isBlockWidget = this.interaction?.blockWidget ?? this.mode === "embed";
        const isListCard = this.interaction?.cardPos !== undefined;

        if (this.mode === "embed" && isListCard) {
            return this.createListEmbedSpacer(doc);
        }

        const container = doc.createElement(this.mode === "embed" ? "div" : "span");

        if (this.mode === "embed") {
            const card = this.createEmbedCard(doc, isBlockWidget, false);
            this.observeImages(card, view);
            return card;
        } else {
            container.className = "block-reference-enhancer-widget block-reference-inline-ref";
        }
        this.applyReferenceDatasets(container);

        if (this.interaction?.availableInlineWidthPx !== undefined) {
            container.style.setProperty(
                "--block-reference-inline-available-width-px",
                `${this.interaction.availableInlineWidthPx}px`,
            );
        }

        if (this.interaction?.stale) {
            container.addClass("is-stale");
            container.setAttribute("title", t('render.staleBlock'));
        }

        if (this.state === "loading") {
            container.setText(t('render.loading'));
            container.addClass("is-loading");
        } else if (this.state === "rendered" && (this.content !== undefined || this.interaction?.segments)) {
            const segments = this.interaction?.segments;
            const hasImages = segments?.some((segment) => segment.type === "image") ?? false;
            const hasText = segments?.some((segment) => segment.type === "text" && segment.text.length > 0) ?? false;
            if (hasImages) {
                container.addClass("has-image");
                if (hasText) {
                    container.addClass("has-image-text");
                }

                for (const segment of segments ?? []) {
                    if (segment.type === "image") {
                        container.appendChild(createBlockReferenceImageElement(doc, segment.image));
                        continue;
                    }
                    if (!segment.text) {
                        continue;
                    }
                    const text = doc.createElement("span");
                    text.className = "block-reference-inline-ref-text";
                    text.setText(segment.text);
                    container.appendChild(text);
                }
            } else {
                const text = doc.createElement("span");
                text.className = "block-reference-inline-ref-text";
                text.setText(this.content ?? "");
                container.appendChild(text);
            }
        } else {
            container.setText(t('render.invalidState'));
            container.addClass("is-error");
        }

        if (this.interaction?.sourceBlockId) {
            container.appendChild(createBlockReferenceActionButtonsElement(this.interaction.sourceBlockId, doc));
        }

        this.observeImages(container, view);

        return container;
    }

    destroy(_dom: HTMLElement): void {
        this.imageObserverCleanup?.();
        this.imageObserverCleanup = null;
    }
}
