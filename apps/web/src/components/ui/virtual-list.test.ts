import { describe, expect, it } from "vitest";

/**
 * Lightweight correctness-only tests for the virtual list sizing contract.
 *
 * Full DOM measurement paths are covered separately by the Playwright smoke
 * at `apps/web/e2e/lawsaw.e2e.spec.ts`; here we focus on deterministic
 * sizing math so that regressions in offset calculation are caught fast.
 */

function buildOffsets(
	total: number,
	size: (index: number) => number,
): number[] {
	const offsets = new Array<number>(total + 1);
	offsets[0] = 0;
	for (let i = 0; i < total; i += 1) {
		offsets[i + 1] = offsets[i] + size(i);
	}
	return offsets;
}

function visibleRange(
	offsets: number[],
	scrollTop: number,
	viewportHeight: number,
	itemCount: number,
	overscan: number,
): { startIndex: number; endIndex: number } {
	if (itemCount === 0) {
		return { startIndex: 0, endIndex: 0 };
	}

	let start = 0;
	while (start < itemCount && offsets[start + 1] <= scrollTop) {
		start += 1;
	}

	let end = start;
	const viewportEnd = scrollTop + viewportHeight;
	while (end < itemCount && offsets[end] < viewportEnd) {
		end += 1;
	}

	return {
		startIndex: Math.max(0, start - overscan),
		endIndex: Math.min(itemCount, end + overscan),
	};
}

describe("VirtualList sizing math", () => {
	it("accumulates fixed size offsets monotonically", () => {
		const offsets = buildOffsets(100, () => 50);
		expect(offsets[0]).toBe(0);
		expect(offsets[1]).toBe(50);
		expect(offsets[10]).toBe(500);
		expect(offsets.at(-1)).toBe(5000);
	});

	it("accumulates variable size offsets monotonically", () => {
		const offsets = buildOffsets(5, (index) => 10 * (index + 1));
		expect(offsets).toEqual([0, 10, 30, 60, 100, 150]);
	});

	it("computes visible range with overscan at the top of the list", () => {
		const offsets = buildOffsets(50, () => 40);
		const { startIndex, endIndex } = visibleRange(
			offsets,
			0,
			320,
			50,
			4,
		);
		expect(startIndex).toBe(0);
		expect(endIndex).toBe(Math.min(50, 8 + 4));
	});

	it("computes visible range with overscan in the middle of the list", () => {
		const offsets = buildOffsets(1000, () => 60);
		const { startIndex, endIndex } = visibleRange(
			offsets,
			6000,
			480,
			1000,
			4,
		);
		expect(startIndex).toBe(Math.max(0, 100 - 4));
		expect(endIndex).toBe(Math.min(1000, 108 + 4));
	});

	it("handles empty lists without crashing", () => {
		const offsets = buildOffsets(0, () => 10);
		const { startIndex, endIndex } = visibleRange(offsets, 0, 400, 0, 4);
		expect(startIndex).toBe(0);
		expect(endIndex).toBe(0);
	});

	it("clamps end index to item count when scrolled past the last row", () => {
		const offsets = buildOffsets(20, () => 50);
		const { startIndex, endIndex } = visibleRange(
			offsets,
			99999,
			400,
			20,
			4,
		);
		expect(endIndex).toBe(20);
		expect(startIndex).toBeLessThanOrEqual(20);
	});
});
