"use client";

/**
 * Bespoke empty-state illustrations (P2#5).
 * Minimal-line SVG with a single brand accent. Each illustration accepts an
 * optional `accent` style prop that resolves to a CSS variable so the
 * visual respects light/dark themes.
 */

interface IllustrationProps {
	className?: string;
	accent?: string;
}

const DEFAULT_ACCENT = "var(--color-primary-500)";
const DEFAULT_MUTED = "var(--surface-muted-border)";
const DEFAULT_INK = "var(--field-foreground)";

function StrokeBase({
	className,
	children,
}: { className?: string; children: React.ReactNode }) {
	return (
		<svg
			role="img"
			aria-hidden="true"
			viewBox="0 0 160 120"
			className={className}
			fill="none"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={1.6}
		>
			{children}
		</svg>
	);
}

/** No articles — stylised page stack with a magnifier. */
export function NoArticlesIllustration({
	className,
	accent = DEFAULT_ACCENT,
}: IllustrationProps) {
	return (
		<StrokeBase className={className}>
			<rect
				x={36}
				y={26}
				width={72}
				height={84}
				rx={10}
				stroke={DEFAULT_MUTED}
			/>
			<rect
				x={44}
				y={18}
				width={72}
				height={84}
				rx={10}
				stroke={DEFAULT_INK}
			/>
			<line x1={56} y1={42} x2={104} y2={42} stroke={DEFAULT_MUTED} />
			<line x1={56} y1={56} x2={94} y2={56} stroke={DEFAULT_MUTED} />
			<line x1={56} y1={70} x2={100} y2={70} stroke={DEFAULT_MUTED} />
			<circle cx={120} cy={88} r={12} stroke={accent} />
			<line x1={129} y1={97} x2={138} y2={106} stroke={accent} />
		</StrokeBase>
	);
}

/** No feed — orbital rss icon with bird-eye dot. */
export function NoFeedIllustration({
	className,
	accent = DEFAULT_ACCENT,
}: IllustrationProps) {
	return (
		<StrokeBase className={className}>
			<circle cx={80} cy={64} r={38} stroke={DEFAULT_MUTED} strokeDasharray="3 4" />
			<path d="M52 86 Q66 86 66 100" stroke={DEFAULT_INK} />
			<path d="M52 70 Q86 70 86 100" stroke={DEFAULT_INK} />
			<path d="M52 54 Q108 54 108 100" stroke={accent} />
			<circle cx={54} cy={100} r={3.2} fill={accent} stroke={accent} />
		</StrokeBase>
	);
}

/** No reports — clipboard with a chart bar. */
export function NoReportsIllustration({
	className,
	accent = DEFAULT_ACCENT,
}: IllustrationProps) {
	return (
		<StrokeBase className={className}>
			<rect x={50} y={20} width={60} height={84} rx={8} stroke={DEFAULT_INK} />
			<rect
				x={68}
				y={14}
				width={24}
				height={12}
				rx={3}
				stroke={DEFAULT_INK}
			/>
			<line x1={62} y1={48} x2={98} y2={48} stroke={DEFAULT_MUTED} />
			<line x1={62} y1={88} x2={98} y2={88} stroke={DEFAULT_MUTED} />
			<rect x={64} y={70} width={6} height={14} fill={accent} stroke={accent} />
			<rect x={76} y={62} width={6} height={22} fill={accent} stroke={accent} />
			<rect x={88} y={56} width={6} height={28} fill={accent} stroke={accent} />
		</StrokeBase>
	);
}

/** No bookmarks — folded ribbon. */
export function NoBookmarksIllustration({
	className,
	accent = DEFAULT_ACCENT,
}: IllustrationProps) {
	return (
		<StrokeBase className={className}>
			<path
				d="M58 20 H102 V100 L80 86 L58 100 Z"
				stroke={DEFAULT_INK}
				fill="none"
			/>
			<path d="M70 50 L80 60 L96 42" stroke={accent} strokeWidth={2.2} />
		</StrokeBase>
	);
}

/** Unauthorized 401 — locked shield. */
export function UnauthorizedIllustration({
	className,
	accent = DEFAULT_ACCENT,
}: IllustrationProps) {
	return (
		<StrokeBase className={className}>
			<path
				d="M80 16 L112 28 V60 Q112 92 80 108 Q48 92 48 60 V28 Z"
				stroke={DEFAULT_INK}
			/>
			<rect x={66} y={56} width={28} height={26} rx={4} stroke={accent} />
			<path d="M72 56 V48 a8 8 0 0 1 16 0 V56" stroke={accent} />
			<circle cx={80} cy={68} r={2.4} fill={accent} />
		</StrokeBase>
	);
}

/** Not found 404 — broken signpost. */
export function NotFoundIllustration({
	className,
	accent = DEFAULT_ACCENT,
}: IllustrationProps) {
	return (
		<StrokeBase className={className}>
			<line x1={80} y1={26} x2={80} y2={108} stroke={DEFAULT_INK} />
			<rect x={36} y={36} width={56} height={20} rx={4} stroke={DEFAULT_INK} />
			<rect x={68} y={66} width={56} height={20} rx={4} stroke={accent} />
			<text
				x={60}
				y={50}
				fontSize={11}
				fill={DEFAULT_INK}
				stroke="none"
				fontFamily="monospace"
			>
				4 0 4
			</text>
			<text
				x={92}
				y={80}
				fontSize={9}
				fill={accent}
				stroke="none"
				fontFamily="monospace"
			>
				lost?
			</text>
		</StrokeBase>
	);
}
