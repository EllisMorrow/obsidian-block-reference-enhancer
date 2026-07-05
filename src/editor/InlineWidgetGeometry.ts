export interface InlineWidthMeasurement {
    contentLeftPx: number;
    contentRightPx: number;
    lineLeftPx: number;
    lineRightPx: number;
    anchorLeftPx: number;
    safetyPx: number;
}

const WIDTH_QUANTUM_PX = 4;
const GEOMETRY_TOLERANCE_PX = 1;

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
