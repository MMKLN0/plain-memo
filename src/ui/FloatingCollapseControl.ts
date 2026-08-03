export interface FloatingCollapseControlBounds {
	cardTop: number;
	cardBottom: number;
	buttonBottom: number;
	flowTop: number;
	viewportBottom: number;
	floatingBoundary: number;
	isMobile: boolean;
}

/** Decides whether an expanded card needs a viewport-anchored collapse control. */
export function shouldFloatCollapseControl(bounds: FloatingCollapseControlBounds): boolean {
	if (bounds.cardTop >= bounds.viewportBottom || bounds.cardBottom <= bounds.flowTop) {
		return false;
	}
	if (bounds.isMobile && bounds.cardTop >= bounds.floatingBoundary) {
		return false;
	}
	return (bounds.isMobile ? bounds.buttonBottom : bounds.cardBottom) > bounds.floatingBoundary;
}

/** Calculates the right offset within Obsidian's fixed-position containing block. */
export function getDesktopFloatingCollapseRightOffset(
	fixedContainerRight: number,
	cardRight: number,
	flowRight: number,
	edgeGap = 8,
): number {
	return Math.max(edgeGap, fixedContainerRight - Math.min(cardRight, flowRight) + edgeGap);
}
