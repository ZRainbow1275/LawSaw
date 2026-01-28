"use client";

import type { KnowledgeEntity, KnowledgeRelatedEntity } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { useKnowledgeEntity, useKnowledgeRelatedEntities } from "@/hooks/use-knowledge";
import { Button } from "@/components/ui/button";
import { Loader2, Minus, MousePointer2, Move, Plus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Point = { x: number; y: number };

type Viewport = {
	panX: number;
	panY: number;
	scale: number;
};

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.5;
const NODE_WIDTH = 240;
const NODE_HEIGHT = 76;

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value));
}

function buildNodes(seed: KnowledgeEntity | undefined, related: KnowledgeRelatedEntity[]) {
	const byId = new Map<string, KnowledgeEntity>();
	if (seed) byId.set(seed.id, seed);
	for (const item of related) byId.set(item.entity.id, item.entity);
	return Array.from(byId.values());
}

type Edge = {
	sourceId: string;
	targetId: string;
	relationType: string;
	weight: number;
};

function buildEdges(seedId: string | undefined, related: KnowledgeRelatedEntity[]) {
	if (!seedId) return [];
	return related
		.filter((item) => item.entity.id !== seedId)
		.map((item): Edge => {
			if (item.direction === "outgoing") {
				return {
					sourceId: seedId,
					targetId: item.entity.id,
					relationType: item.relation_type,
					weight: item.weight,
				};
			}
			return {
				sourceId: item.entity.id,
				targetId: seedId,
				relationType: item.relation_type,
				weight: item.weight,
			};
		});
}

function getNodeBorder(entityType: string) {
	switch (entityType) {
		case "organization":
			return "border-sky-200 bg-sky-50/70";
		case "concept":
			return "border-emerald-200 bg-emerald-50/70";
		case "law":
			return "border-violet-200 bg-violet-50/70";
		case "person":
			return "border-amber-200 bg-amber-50/70";
		default:
			return "border-neutral-200 bg-white/80";
	}
}

function getRelativePoint(container: HTMLDivElement, clientX: number, clientY: number): Point {
	const rect = container.getBoundingClientRect();
	return { x: clientX - rect.left, y: clientY - rect.top };
}

function worldToScreen(world: Point, viewport: Viewport): Point {
	return {
		x: viewport.panX + world.x * viewport.scale,
		y: viewport.panY + world.y * viewport.scale,
	};
}

function screenToWorld(screen: Point, viewport: Viewport): Point {
	return {
		x: (screen.x - viewport.panX) / viewport.scale,
		y: (screen.y - viewport.panY) / viewport.scale,
	};
}

export function KnowledgeCanvas({
	seedEntityId,
	selectedEntityId,
	onSelectEntity,
	className,
}: {
	seedEntityId: string | null;
	selectedEntityId: string | null;
	onSelectEntity: (id: string) => void;
	className?: string;
}) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(
		null,
	);

	const [viewport, setViewport] = useState<Viewport>({ panX: 0, panY: 0, scale: 1 });
	const [positions, setPositions] = useState<Record<string, Point>>({});
	const [isFocused, setIsFocused] = useState(false);
	const [isSpacePressed, setIsSpacePressed] = useState(false);
	const [isPanning, setIsPanning] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const initializedViewportRef = useRef<string | null>(null);

	const seedQuery = useKnowledgeEntity(seedEntityId);
	const relatedQuery = useKnowledgeRelatedEntities(seedEntityId, 24);

	const seed = seedQuery.data;
	const related = relatedQuery.data ?? [];

	const nodes = useMemo(() => buildNodes(seed, related), [seed, related]);
	const edges = useMemo(() => buildEdges(seed?.id, related), [seed?.id, related]);
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const observer = new ResizeObserver(() => {
			const rect = container.getBoundingClientRect();
			setContainerSize({ width: rect.width, height: rect.height });
		});

		observer.observe(container);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!seed?.id) return;
		setPositions((prev) => {
			const next: Record<string, Point> = { ...prev };

			next[seed.id] = next[seed.id] ?? { x: 0, y: 0 };
			const neighborIds = nodes.filter((n) => n.id !== seed.id).map((n) => n.id);
			const count = neighborIds.length;
			const radius = 260;

			for (const [idx, id] of neighborIds.entries()) {
				if (next[id]) continue;
				const theta = (2 * Math.PI * idx) / Math.max(1, count);
				next[id] = {
					x: Math.cos(theta) * radius,
					y: Math.sin(theta) * radius,
				};
			}

			for (const key of Object.keys(next)) {
				if (!nodes.some((n) => n.id === key)) delete next[key];
			}

			return next;
		});
	}, [seed?.id, nodes]);

	useEffect(() => {
		if (!seedEntityId) return;
		if (!containerSize) return;
		if (initializedViewportRef.current === seedEntityId) return;
		initializedViewportRef.current = seedEntityId;
		setViewport({ panX: containerSize.width / 2, panY: containerSize.height / 2, scale: 1 });
	}, [seedEntityId, containerSize]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!isFocused) return;
			if (event.code !== "Space") return;
			if (event.repeat) return;

			const target = event.target;
			if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

			event.preventDefault();
			setIsSpacePressed(true);
		};

		const handleKeyUp = (event: KeyboardEvent) => {
			if (event.code !== "Space") return;
			setIsSpacePressed(false);
		};

		window.addEventListener("keydown", handleKeyDown, { passive: false });
		window.addEventListener("keyup", handleKeyUp);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
		};
	}, [isFocused]);

	const panRef = useRef<{
		pointerId: number;
		start: Point;
		startPan: Point;
		target: HTMLDivElement;
	} | null>(null);

	const panCleanupRef = useRef<(() => void) | null>(null);

	const stopPan = (pointerId: number) => {
		const pan = panRef.current;
		if (!pan || pan.pointerId !== pointerId) return;

		panRef.current = null;
		setIsPanning(false);

		panCleanupRef.current?.();
		panCleanupRef.current = null;

		if (pan.target.hasPointerCapture(pointerId)) {
			try {
				pan.target.releasePointerCapture(pointerId);
			} catch {
				// ignore
			}
		}
	};

	const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!containerRef.current) return;
		setIsFocused(true);

		const canPan =
			event.button === 1 || (event.button === 0 && (isSpacePressed || !seedEntityId));
		if (!canPan) return;

		event.preventDefault();
		const start = { x: event.clientX, y: event.clientY };
		panRef.current = {
			pointerId: event.pointerId,
			start,
			startPan: { x: viewport.panX, y: viewport.panY },
			target: event.currentTarget,
		};
		setIsPanning(true);

		try {
			event.currentTarget.setPointerCapture(event.pointerId);
		} catch {
			// ignore
		}

		panCleanupRef.current?.();
		const handleMove = (moveEvent: PointerEvent) => {
			const pan = panRef.current;
			if (!pan || pan.pointerId !== moveEvent.pointerId) return;

			const dx = moveEvent.clientX - pan.start.x;
			const dy = moveEvent.clientY - pan.start.y;
			setViewport((prev) => ({ ...prev, panX: pan.startPan.x + dx, panY: pan.startPan.y + dy }));
		};

		const handleEnd = (endEvent: PointerEvent) => {
			const pan = panRef.current;
			if (!pan || pan.pointerId !== endEvent.pointerId) return;
			stopPan(endEvent.pointerId);
		};

		window.addEventListener("pointermove", handleMove);
		window.addEventListener("pointerup", handleEnd);
		window.addEventListener("pointercancel", handleEnd);
		panCleanupRef.current = () => {
			window.removeEventListener("pointermove", handleMove);
			window.removeEventListener("pointerup", handleEnd);
			window.removeEventListener("pointercancel", handleEnd);
		};
	};

	const dragRef = useRef<{
		pointerId: number;
		nodeId: string;
		start: Point;
		startPos: Point;
		startScale: number;
		target: HTMLButtonElement;
	} | null>(null);

	const dragCleanupRef = useRef<(() => void) | null>(null);

	const stopDrag = (pointerId: number) => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== pointerId) return;

		dragRef.current = null;
		setIsDragging(false);

		dragCleanupRef.current?.();
		dragCleanupRef.current = null;

		if (drag.target.hasPointerCapture(pointerId)) {
			try {
				drag.target.releasePointerCapture(pointerId);
			} catch {
				// ignore
			}
		}
	};

	const handleNodePointerDown = (
		event: React.PointerEvent<HTMLButtonElement>,
		nodeId: string,
	) => {
		if (event.button !== 0) return;
		if (isSpacePressed) {
			// 空格模式下优先平移画布（允许事件冒泡到画布容器）
			event.preventDefault();
			return;
		}
		event.stopPropagation();
		event.preventDefault();

		const startPos = positions[nodeId] ?? { x: 0, y: 0 };
		dragRef.current = {
			pointerId: event.pointerId,
			nodeId,
			start: { x: event.clientX, y: event.clientY },
			startPos,
			startScale: viewport.scale,
			target: event.currentTarget,
		};
		setIsDragging(true);

		try {
			event.currentTarget.setPointerCapture(event.pointerId);
		} catch {
			// ignore
		}

		dragCleanupRef.current?.();
		const handleMove = (moveEvent: PointerEvent) => {
			const drag = dragRef.current;
			if (!drag || drag.pointerId !== moveEvent.pointerId) return;

			const dx = (moveEvent.clientX - drag.start.x) / drag.startScale;
			const dy = (moveEvent.clientY - drag.start.y) / drag.startScale;
			setPositions((prev) => ({
				...prev,
				[drag.nodeId]: { x: drag.startPos.x + dx, y: drag.startPos.y + dy },
			}));
		};

		const handleEnd = (endEvent: PointerEvent) => {
			const drag = dragRef.current;
			if (!drag || drag.pointerId !== endEvent.pointerId) return;
			stopDrag(endEvent.pointerId);
		};

		window.addEventListener("pointermove", handleMove);
		window.addEventListener("pointerup", handleEnd);
		window.addEventListener("pointercancel", handleEnd);
		dragCleanupRef.current = () => {
			window.removeEventListener("pointermove", handleMove);
			window.removeEventListener("pointerup", handleEnd);
			window.removeEventListener("pointercancel", handleEnd);
		};

		onSelectEntity(nodeId);
	};

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const handleWheel = (event: WheelEvent) => {
			if (isPanning || isDragging) return;
			if (!event.cancelable) return;

			// trackpad: pan; ctrl+wheel (pinch): zoom.
			event.preventDefault();
			const mouse = getRelativePoint(container, event.clientX, event.clientY);

			setViewport((prev) => {
				if (event.ctrlKey) {
					const zoomFactor = Math.exp(-event.deltaY * 0.001);
					const nextScale = clamp(prev.scale * zoomFactor, MIN_SCALE, MAX_SCALE);
					const world = screenToWorld(mouse, prev);
					const nextPanX = mouse.x - world.x * nextScale;
					const nextPanY = mouse.y - world.y * nextScale;
					return { panX: nextPanX, panY: nextPanY, scale: nextScale };
				}

				return {
					...prev,
					panX: prev.panX - event.deltaX,
					panY: prev.panY - event.deltaY,
				};
			});
		};

		container.addEventListener("wheel", handleWheel, { passive: false });
		return () => {
			container.removeEventListener("wheel", handleWheel);
		};
	}, [isPanning, isDragging]);

	useEffect(() => {
		return () => {
			panCleanupRef.current?.();
			dragCleanupRef.current?.();
		};
	}, []);

	const zoomBy = (delta: number) => {
		const container = containerRef.current;
		if (!container || !containerSize) return;
		const center: Point = { x: containerSize.width / 2, y: containerSize.height / 2 };
		setViewport((prev) => {
			const nextScale = clamp(prev.scale + delta, MIN_SCALE, MAX_SCALE);
			const world = screenToWorld(center, prev);
			return {
				panX: center.x - world.x * nextScale,
				panY: center.y - world.y * nextScale,
				scale: nextScale,
			};
		});
	};

	const resetView = () => {
		if (!containerSize) return;
		setViewport({ panX: containerSize.width / 2, panY: containerSize.height / 2, scale: 1 });
	};

	const showEmptySeed = !seedEntityId;
	const isLoading = seedQuery.isLoading || relatedQuery.isLoading;

	return (
		<div className={cn("relative flex min-h-0 flex-1 flex-col", className)}>
			<div className="flex items-center justify-between gap-2 pb-3">
				<div className="flex items-center gap-2 text-sm text-neutral-600">
					<span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600">
						<Move className="h-4 w-4" />
					</span>
					<div className="min-w-0">
						<div className="font-medium text-neutral-900">知识图谱画布</div>
						<div className="text-xs text-neutral-500">
							{showEmptySeed
								? "先从左侧选择一个实体作为中心节点"
								: "滚轮/触控板平移，Ctrl+滚轮缩放；按住空格拖拽平移"}
						</div>
					</div>
				</div>

				<div className="flex items-center gap-1">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => zoomBy(-0.15)}
						disabled={showEmptySeed}
						title="缩小"
					>
						<Minus className="h-4 w-4" />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => zoomBy(0.15)}
						disabled={showEmptySeed}
						title="放大"
					>
						<Plus className="h-4 w-4" />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={resetView}
						disabled={showEmptySeed}
						title="重置视图"
					>
						<RotateCcw className="h-4 w-4" />
					</Button>
					<div className="ml-2 hidden rounded-lg bg-neutral-100 px-2 py-1 text-xs text-neutral-600 sm:block">
						{Math.round(viewport.scale * 100)}%
					</div>
				</div>
			</div>

			<div
				ref={containerRef}
				data-testid="knowledge-canvas"
				className={cn(
					"relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-neutral-200 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.12)_1px,transparent_0)] [background-size:24px_24px]",
					"outline-none",
					isPanning ? "cursor-grabbing" : isSpacePressed && "cursor-grab",
				)}
				onPointerEnter={() => setIsFocused(true)}
				onPointerLeave={() => {
					if (isPanning || isDragging) return;
					setIsFocused(false);
				}}
				onPointerDown={handleCanvasPointerDown}
			>
				<svg className="absolute inset-0 pointer-events-none" aria-hidden="true">
					<title>Knowledge graph edges</title>
					{edges.map((edge) => {
						const fromWorld = positions[edge.sourceId];
						const toWorld = positions[edge.targetId];
						if (!fromWorld || !toWorld) return null;

						const fromScreen = worldToScreen(
							{ x: fromWorld.x + NODE_WIDTH / 2, y: fromWorld.y + NODE_HEIGHT / 2 },
							viewport,
						);
						const toScreen = worldToScreen(
							{ x: toWorld.x + NODE_WIDTH / 2, y: toWorld.y + NODE_HEIGHT / 2 },
							viewport,
						);

						const opacity = clamp(edge.weight / 10, 0.25, 0.8);
						return (
							<line
								key={`${edge.sourceId}-${edge.targetId}-${edge.relationType}`}
								x1={fromScreen.x}
								y1={fromScreen.y}
								x2={toScreen.x}
								y2={toScreen.y}
								stroke="rgb(120 113 108)"
								strokeOpacity={opacity}
								strokeWidth={2}
							/>
						);
					})}
				</svg>

				<div
					className="absolute left-0 top-0 will-change-transform"
					style={{
						transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.scale})`,
						transformOrigin: "0 0",
					}}
				>
					{nodes.map((node) => {
						const pos = positions[node.id] ?? { x: 0, y: 0 };
						const selected = node.id === selectedEntityId;
						return (
							<button
								key={node.id}
								type="button"
								data-testid={`knowledge-node-${node.id}`}
								className={cn(
									"absolute select-none text-left",
									"rounded-xl border-2 shadow-sm",
									"px-3 py-2",
									"transition-shadow",
									getNodeBorder(node.entity_type),
									selected && "border-primary-500 shadow-brand",
								)}
								style={{
									width: NODE_WIDTH,
									height: NODE_HEIGHT,
									transform: `translate(${pos.x}px, ${pos.y}px)`,
								}}
								onPointerDown={(event) => handleNodePointerDown(event, node.id)}
							>
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0">
										<div className="truncate text-sm font-semibold text-neutral-900">
											{node.name}
										</div>
										<div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
											<span className="truncate">{node.entity_type}</span>
											<span className="text-neutral-300">•</span>
											<span>{node.mention_count} 次</span>
										</div>
									</div>
									<span
										className={cn(
											"mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg border",
											"border-neutral-200 bg-white/70 text-neutral-500",
										)}
										title={selected ? "已选中" : "点击选中，拖拽移动"}
									>
										<MousePointer2 className="h-3.5 w-3.5" />
									</span>
								</div>
							</button>
						);
					})}
				</div>

				{isLoading && (
					<div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-sm">
						<div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-700 shadow-sm">
							<Loader2 className="h-4 w-4 animate-spin" />
							<span>加载图谱数据中…</span>
						</div>
					</div>
				)}

				{showEmptySeed && (
					<div className="absolute inset-0 flex items-center justify-center p-6">
						<div className="max-w-md rounded-2xl border border-neutral-200 bg-white/80 p-6 text-center shadow-sm backdrop-blur">
							<div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
								<Move className="h-5 w-5" />
							</div>
							<h3 className="mt-4 text-base font-semibold text-neutral-900">
								还没有选中中心实体
							</h3>
							<p className="mt-2 text-sm text-neutral-600">
								从左侧列表选择一个实体，系统会加载它的关系并在画布中可视化。
							</p>
						</div>
					</div>
				)}

				{seedEntityId && !isLoading && nodes.length === 0 && (
					<div className="absolute inset-0 flex items-center justify-center p-6">
						<div className="max-w-md rounded-2xl border border-neutral-200 bg-white/80 p-6 text-center shadow-sm backdrop-blur">
							<div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-600">
								<Loader2 className="h-5 w-5" />
							</div>
							<h3 className="mt-4 text-base font-semibold text-neutral-900">
								暂无可用的实体关系数据
							</h3>
							<p className="mt-2 text-sm text-neutral-600">
								如果数据库中还没有实体/关系，请先运行 AI/采集流程或使用“初始化知识图谱”。
							</p>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
