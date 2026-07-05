export interface InlineWidthMeasurement {
    contentLeftPx: number;
    contentRightPx: number;
    lineLeftPx: number;
    lineRightPx: number;
    anchorLeftPx: number;
    safetyPx: number;
}

export interface InlineHorizontalGeometryKeyInput {
    contentLeftPx: number;
    contentRightPx: number;
    lineLeftPx?: number;
    lineRightPx?: number;
    fontFamily: string;
    fontSize: string;
    lineHeight: string;
    listIndent: string;
    fileLineWidth: string;
}

const WIDTH_QUANTUM_PX = 4;
const GEOMETRY_TOLERANCE_PX = 1;

function normalizeGeometryKeyPx(value?: number): number {
    if (value === undefined || !Number.isFinite(value)) {
        return -1;
    }

    return Math.round(value / WIDTH_QUANTUM_PX) * WIDTH_QUANTUM_PX;
}

export function createInlineHorizontalGeometryKey(input: InlineHorizontalGeometryKeyInput): string {
    return [
        normalizeGeometryKeyPx(input.contentLeftPx),
        normalizeGeometryKeyPx(input.contentRightPx),
        normalizeGeometryKeyPx(input.lineLeftPx),
        normalizeGeometryKeyPx(input.lineRightPx),
        input.fontFamily,
        input.fontSize,
        input.lineHeight,
        input.listIndent,
        input.fileLineWidth,
    ].join(":");
}

export function calculateInlineAvailableWidth(measurement: InlineWidthMeasurement): number | null {
    const values = Object.values(measurement);
    if (values.some((value) => !Number.isFinite(value))) {
        return null;
    }

    const contentLeft = Math.min(measurement.contentLeftPx, measurement.contentRightPx);
    const contentRight = Math.max(measurement.contentLeftPx, measurement.contentRightPx);
    const lineLeft = Math.min(measurement.lineLeftPx, measurement.lineRightPx);
    const lineRight = Math.max(measurement.lineLeftPx, measurement.lineRightPx);
    const availableLeft = Math.max(contentLeft, lineLeft);
    const availableRight = Math.min(contentRight, lineRight);

    if (availableRight <= availableLeft
        || measurement.anchorLeftPx < availableLeft - GEOMETRY_TOLERANCE_PX
        || measurement.anchorLeftPx >= availableRight) {
        return null;
    }

    const rawWidth = availableRight - measurement.anchorLeftPx - Math.max(measurement.safetyPx, 0);
    const width = Math.floor(rawWidth / WIDTH_QUANTUM_PX) * WIDTH_QUANTUM_PX;
    return width > 0 ? width : null;
}
