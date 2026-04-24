"use client";

import { cn } from "@/lib/utils";
import {
	type CSSProperties,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

/**
 * Lightweight native virtual list.
 *
 * Avoids adding any new dependencies. Supports two measurement modes:
 *   - "fixed"    — every row has the same pixel height (fastest)
 *   - "dynamic"  — rows measure themselves via ResizeObserver with a fallback
 *                  to an estimated height while rows are mounting
 *
 * Usage:
 *   <VirtualList items={rows} estimateSize={() => 112}>
 *     {({ item, index, style }) => (
 *       <div style={style}>{item.title}</div>
 *     )}
 *   </VirtualList>
 *
 * Contract:
 *   - `items` must be stable across renders; derive with `useMemo` when data
 *     comes from server state.
 *   - `children` is called per visible row; it MUST spread the provided
 *     `style` onto the outermost DOM node to preserve absolute positioning.
 *   - The container renders 4 extra rows above/below the viewport by default
 *     to smooth fast scrolling.
 */
export interface VirtualListRenderArgs<TItem> {
	item: TItem;
	index: number;
	style: CSSProperties;
}

export type VirtualListSizing =
	| { mode: "fixed"; size: number }
	| {
			mode: "dynamic";
			estimateSize: (index: number) => number;
			measureKey?: (index: number) => string;
	  };

export interface VirtualListProps<TItem> {
	items: TItem[];
	children: (args: VirtualListRenderArgs<TItem>) => ReactNode;
	sizing: VirtualListSizing;
	overscan?: number;
	className?: string;
	style?: CSSProperties;
	getKey?: (item: TItem, index: number) => string;
	/** Height of the scroll container in px. Default: 100vh-like behaviour. */
	height?: number | string;
}

export function VirtualList<TItem>({
	items,
	children,
	sizing,
	overscan = 4,
	className,
	style,
	getKey,
	height = 560,
}: VirtualListProps<TItem>) {
	const containerRef = useRef<HTMLUListElement | null>(null);
	const [viewportHeight, setViewportHeight] = useState(0);
	const [scrollTop, setScrollTop] = useState(0);
	const [dynamicSizes, setDynamicSizes] = useState<Map<number, number>>(
		() => new Map(),
	);

	useEffect(() => {
		const node = containerRef.current;
		if (!node) return;

		const setHeight = () => setViewportHeight(node.clientHeight || 0);
		setHeight();

		const RO = typeof ResizeObserver === "undefined" ? null : ResizeObserver;
		if (!RO) return;

		const observer = new RO(() => setHeight());
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	const getRowSize = useCallback(
		(index: number): number => {
			if (sizing.mode === "fixed") return sizing.size;
			const measured = dynamicSizes.get(index);
			if (typeof measured === "number") return measured;
			return sizing.estimateSize(index);
		},
		[dynamicSizes, sizing],
	);

	const totalSize = useMemo(() => {
		let total = 0;
		for (let i = 0; i < items.length; i += 1) {
			total += getRowSize(i);
		}
		return total;
	}, [getRowSize, items.length]);

	const offsets = useMemo(() => {
		const offsetArr = new Array<number>(items.length + 1);
		offsetArr[0] = 0;
		for (let i = 0; i < items.length; i += 1) {
			offsetArr[i + 1] = offsetArr[i] + getRowSize(i);
		}
		return offsetArr;
	}, [getRowSize, items.length]);

	const { startIndex, endIndex } = useMemo(() => {
		if (items.length === 0) {
			return { startIndex: 0, endIndex: 0 };
		}

		let start = 0;
		while (start < items.length && offsets[start + 1] <= scrollTop) {
			start += 1;
		}

		let end = start;
		const viewportEnd = scrollTop + viewportHeight;
		while (end < items.length && offsets[end] < viewportEnd) {
			end += 1;
		}

		return {
			startIndex: Math.max(0, start - overscan),
			endIndex: Math.min(items.length, end + overscan),
		};
	}, [items.length, offsets, overscan, scrollTop, viewportHeight]);

	const handleScroll = useCallback((event: React.UIEvent<HTMLUListElement>) => {
		setScrollTop(event.currentTarget.scrollTop);
	}, []);

	const measureRow = useCallback(
		(index: number, size: number) => {
			setDynamicSizes((previous) => {
				const current = previous.get(index);
				if (current === size) return previous;
				const updated = new Map(previous);
				updated.set(index, size);
				return updated;
			});
		},
		[],
	);

	const visibleRows = useMemo(() => {
		const rendered: ReactNode[] = [];
		for (let i = startIndex; i < endIndex; i += 1) {
			const item = items[i];
			if (!item) continue;
			const rowStyle: CSSProperties = {
				position: "absolute",
				top: offsets[i],
				left: 0,
				right: 0,
				height: sizing.mode === "fixed" ? sizing.size : undefined,
			};
			const key = getKey ? getKey(item, i) : `row-${i}`;
			rendered.push(
				<VirtualRow
					key={key}
					index={i}
					dynamic={sizing.mode === "dynamic"}
					onMeasure={measureRow}
				>
					{children({ item, index: i, style: rowStyle })}
				</VirtualRow>,
			);
		}
		return rendered;
	}, [
		children,
		endIndex,
		getKey,
		items,
		measureRow,
		offsets,
		sizing,
		startIndex,
	]);

	return (
		<ul
			ref={containerRef}
			className={cn("relative overflow-auto m-0 p-0 list-none", className)}
			style={{ height, ...style }}
			onScroll={handleScroll}
		>
			<div style={{ height: totalSize, position: "relative" }} role="presentation">
				{visibleRows}
			</div>
		</ul>
	);
}

interface VirtualRowProps {
	index: number;
	dynamic: boolean;
	onMeasure: (index: number, size: number) => void;
	children: ReactNode;
}

function VirtualRow({ index, dynamic, onMeasure, children }: VirtualRowProps) {
	const rowRef = useRef<HTMLLIElement | null>(null);

	useEffect(() => {
		if (!dynamic) return;
		const node = rowRef.current;
		if (!node) return;

		const RO = typeof ResizeObserver === "undefined" ? null : ResizeObserver;
		if (!RO) {
			onMeasure(index, node.getBoundingClientRect().height);
			return;
		}

		const observer = new RO((entries) => {
			const entry = entries[0];
			if (!entry) return;
			onMeasure(index, entry.contentRect.height);
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, [dynamic, index, onMeasure]);

	return (
		<li ref={rowRef} className="list-none">
			{children}
		</li>
	);
}
