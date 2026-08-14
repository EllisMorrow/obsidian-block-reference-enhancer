import type { BlockImageSpec } from '../services/BlockImageExtraction';

const DEFAULT_THUMBNAIL_WIDTH_PX = 120;
const DEFAULT_THUMBNAIL_HEIGHT_PX = 90;
const MAX_THUMBNAIL_WIDTH_PX = 240;
const MAX_THUMBNAIL_HEIGHT_PX = 180;

export interface BlockReferenceImageFrameSize {
	width: number;
	height: number;
}

export function calculateBlockReferenceImageFrame(
	image: BlockImageSpec,
	naturalSize?: BlockReferenceImageFrameSize,
): BlockReferenceImageFrameSize {
	const validNaturalSize = naturalSize
		&& Number.isFinite(naturalSize.width)
		&& Number.isFinite(naturalSize.height)
		&& naturalSize.width > 0
		&& naturalSize.height > 0
		? naturalSize
		: undefined;
	const hasExplicitSize = image.width !== undefined || image.height !== undefined;
	const naturalRatio = validNaturalSize ? validNaturalSize.width / validNaturalSize.height : undefined;
	const requestedWidth = image.width
		?? (image.height
			? Math.round(image.height * (naturalRatio ?? 4 / 3))
			: DEFAULT_THUMBNAIL_WIDTH_PX);
	const requestedHeight = image.height
		?? (image.width
			? Math.round(image.width / (naturalRatio ?? 4 / 3))
			: validNaturalSize
				? Math.round(DEFAULT_THUMBNAIL_WIDTH_PX / naturalRatio!)
				: DEFAULT_THUMBNAIL_HEIGHT_PX);
	const scale = hasExplicitSize
		? 1
		: Math.min(
			1,
			MAX_THUMBNAIL_WIDTH_PX / requestedWidth,
			MAX_THUMBNAIL_HEIGHT_PX / requestedHeight,
		);

	return {
		width: Math.max(1, Math.round(requestedWidth * scale)),
		height: Math.max(1, Math.round(requestedHeight * scale)),
	};
}

function applyFrameSize(
	frame: HTMLElement,
	imageElement: HTMLImageElement,
	frameSize: BlockReferenceImageFrameSize,
): void {
	frame.style.width = `${frameSize.width}px`;
	frame.style.setProperty('aspect-ratio', `${frameSize.width} / ${frameSize.height}`);
	imageElement.width = frameSize.width;
	imageElement.height = frameSize.height;
}

export function settleBlockReferenceImageElement(imageElement: HTMLImageElement): void {
	const frame = imageElement.closest('.block-reference-inline-ref-image-frame');
	if (!frame) {
		return;
	}

	const requestedWidth = Number(imageElement.dataset.blockReferenceWidth);
	const requestedHeight = Number(imageElement.dataset.blockReferenceHeight);
	const image: BlockImageSpec = {
		src: imageElement.src,
		alt: imageElement.alt,
		width: Number.isFinite(requestedWidth) && requestedWidth > 0 ? requestedWidth : undefined,
		height: Number.isFinite(requestedHeight) && requestedHeight > 0 ? requestedHeight : undefined,
	};
	applyFrameSize(frame as HTMLElement, imageElement, calculateBlockReferenceImageFrame(image, {
		width: imageElement.naturalWidth,
		height: imageElement.naturalHeight,
	}));
}

export function createBlockReferenceImageElement(ownerDocument: Document, image: BlockImageSpec): HTMLSpanElement {
	const frame = ownerDocument.createElement('span');
	frame.addClass('block-reference-inline-ref-image-frame');

	const imageElement = ownerDocument.createElement('img');
	imageElement.addClass('block-reference-inline-ref-image');
	imageElement.alt = image.alt;
	imageElement.loading = 'lazy';
	imageElement.decoding = 'async';
	if (image.width !== undefined) {
		imageElement.dataset.blockReferenceWidth = String(image.width);
	}
	if (image.height !== undefined) {
		imageElement.dataset.blockReferenceHeight = String(image.height);
	}
	applyFrameSize(frame, imageElement, calculateBlockReferenceImageFrame(image));

	imageElement.src = image.src;
	frame.appendChild(imageElement);

	return frame;
}
