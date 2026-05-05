"use client";

/**
 * Reading-tracker hook (Task #34 / Phase D.9).
 *
 * Wires an IntersectionObserver to the article body element plus a scroll
 * listener on the window to compute:
 *   - dwell_ms   — wall-clock time the article was on screen (paused when
 *                  the user tabs away or scrolls the body out of view)
 *   - scroll_pct — peak ratio of (scrolled distance / scrollable distance)
 *                  across the body, expressed as a 0-100 integer
 *   - finished   — true once `scroll_pct >= 90`
 *
 * Beats fire at three discrete moments:
 *   1. `enter`    — first time the body enters the viewport
 *   2. `halfway`  — first time `scroll_pct` crosses 50
 *   3. `complete` — first time `scroll_pct` crosses 90 (also flips
 *                   `finished` true)
 *
 * On unmount and `visibilitychange → hidden`, a final `exit` beat is sent via
 * `navigator.sendBeacon` to survive tab close.
 */

import { useEffect, useRef } from "react";

import { useRecordArticleRead } from "@/hooks/use-record-article-read";

interface UseReadingTrackerOptions {
	articleId: string | null;
	containerRef: React.RefObject<HTMLElement | null>;
	enabled?: boolean;
}

const HALFWAY_PCT = 50;
const COMPLETE_PCT = 90;

export function useReadingTracker({
	articleId,
	containerRef,
	enabled = true,
}: UseReadingTrackerOptions) {
	const { record, flushFinal } = useRecordArticleRead(articleId);

	const dwellAccumRef = useRef(0);
	const inViewSinceRef = useRef<number | null>(null);
	const peakPctRef = useRef(0);
	const sentEnterRef = useRef(false);
	const sentHalfwayRef = useRef(false);
	const sentCompleteRef = useRef(false);
	const visibleRef = useRef(false);

	useEffect(() => {
		if (!enabled || !articleId) return;
		const node = containerRef.current;
		if (!node) return;

		// Reset accumulators for each new articleId.
		dwellAccumRef.current = 0;
		inViewSinceRef.current = null;
		peakPctRef.current = 0;
		sentEnterRef.current = false;
		sentHalfwayRef.current = false;
		sentCompleteRef.current = false;
		visibleRef.current = false;

		const accruedDwell = (): number => {
			if (inViewSinceRef.current === null) return dwellAccumRef.current;
			return dwellAccumRef.current + (Date.now() - inViewSinceRef.current);
		};

		const onIntersect: IntersectionObserverCallback = (entries) => {
			for (const entry of entries) {
				if (entry.target !== node) continue;
				const visible = entry.isIntersecting && entry.intersectionRatio > 0.05;
				if (visible && !visibleRef.current) {
					visibleRef.current = true;
					inViewSinceRef.current = Date.now();
					if (!sentEnterRef.current) {
						sentEnterRef.current = true;
						record({
							dwell_ms: 0,
							scroll_pct: peakPctRef.current,
							finished: false,
							milestone: "enter",
						});
					}
				} else if (!visible && visibleRef.current) {
					visibleRef.current = false;
					if (inViewSinceRef.current !== null) {
						dwellAccumRef.current += Date.now() - inViewSinceRef.current;
						inViewSinceRef.current = null;
					}
				}
			}
		};

		const observer = new IntersectionObserver(onIntersect, {
			threshold: [0, 0.05, 0.5, 1],
		});
		observer.observe(node);

		const computeScrollPct = (): number => {
			const rect = node.getBoundingClientRect();
			const viewportH =
				window.innerHeight || document.documentElement.clientHeight || 0;
			if (rect.height <= 0 || viewportH <= 0) return peakPctRef.current;
			// How far through the body has scrolled past the top of the viewport.
			const scrolled = Math.max(0, viewportH - rect.top);
			const denominator = rect.height;
			if (denominator <= 0) return peakPctRef.current;
			const ratio = scrolled / denominator;
			const pct = Math.min(100, Math.max(0, Math.round(ratio * 100)));
			return pct;
		};

		const onScroll = () => {
			const next = computeScrollPct();
			if (next > peakPctRef.current) {
				peakPctRef.current = next;
			}
			if (!sentHalfwayRef.current && peakPctRef.current >= HALFWAY_PCT) {
				sentHalfwayRef.current = true;
				record({
					dwell_ms: accruedDwell(),
					scroll_pct: peakPctRef.current,
					finished: false,
					milestone: "halfway",
				});
			}
			if (!sentCompleteRef.current && peakPctRef.current >= COMPLETE_PCT) {
				sentCompleteRef.current = true;
				record({
					dwell_ms: accruedDwell(),
					scroll_pct: peakPctRef.current,
					finished: true,
					milestone: "complete",
				});
			} else if (peakPctRef.current >= COMPLETE_PCT) {
				// Continue beating debounced progress without re-emitting milestone.
				record({
					dwell_ms: accruedDwell(),
					scroll_pct: peakPctRef.current,
					finished: true,
				});
			} else if (sentEnterRef.current) {
				record({
					dwell_ms: accruedDwell(),
					scroll_pct: peakPctRef.current,
					finished: false,
				});
			}
		};

		const onVisibilityChange = () => {
			if (document.visibilityState === "hidden") {
				if (visibleRef.current && inViewSinceRef.current !== null) {
					dwellAccumRef.current += Date.now() - inViewSinceRef.current;
					inViewSinceRef.current = null;
				}
				visibleRef.current = false;
				flushFinal({
					dwell_ms: accruedDwell(),
					scroll_pct: peakPctRef.current,
					finished: peakPctRef.current >= COMPLETE_PCT,
					milestone: "exit",
				});
			} else if (document.visibilityState === "visible") {
				if (!visibleRef.current) {
					visibleRef.current = true;
					inViewSinceRef.current = Date.now();
				}
			}
		};

		window.addEventListener("scroll", onScroll, { passive: true });
		document.addEventListener("visibilitychange", onVisibilityChange);

		return () => {
			observer.disconnect();
			window.removeEventListener("scroll", onScroll);
			document.removeEventListener("visibilitychange", onVisibilityChange);
			// Final beat on unmount — flush whatever we've measured so the
			// recommendation pipeline gets exit data even when the user follows
			// an in-app link instead of closing the tab.
			flushFinal({
				dwell_ms: accruedDwell(),
				scroll_pct: peakPctRef.current,
				finished: peakPctRef.current >= COMPLETE_PCT,
				milestone: "exit",
			});
		};
	}, [articleId, containerRef, enabled, flushFinal, record]);
}
