"use client";

import type { TimelineSeries } from "@/hooks/use-statistics";
import { useT } from "@/lib/i18n-client";
import {
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { DIMENSION_COLORS } from "../constants";

interface TimelineChartProps {
	series: TimelineSeries[];
}

export function TimelineChart({ series }: TimelineChartProps) {
	const t = useT();

	if (series.length === 0) {
		return (
			<div className="flex h-[400px] items-center justify-center text-sm text-neutral-500">
				{t("No timeline data available")}
			</div>
		);
	}

	// Transform series data to recharts format
	const allDates = new Set<string>();
	for (const s of series) {
		for (const p of s.points) allDates.add(p.date);
	}

	const chartData = [...allDates].sort().map((date) => {
		const point: Record<string, string | number> = { date };
		for (const s of series) {
			const match = s.points.find((p) => p.date === date);
			point[s.dimension_value] = match?.count ?? 0;
		}
		return point;
	});

	return (
		<ResponsiveContainer width="100%" height={400}>
			<LineChart
				data={chartData}
				margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
			>
				<XAxis
					dataKey="date"
					tick={{ fontSize: 11 }}
					axisLine={false}
					tickLine={false}
				/>
				<YAxis
					allowDecimals={false}
					tick={{ fontSize: 12 }}
					axisLine={false}
					tickLine={false}
				/>
				<Tooltip
					contentStyle={{
						borderRadius: "8px",
						border: "1px solid #e5e5e5",
						fontSize: "13px",
					}}
				/>
				<Legend verticalAlign="bottom" height={36} iconType="line" />
				{series.map((s, i) => (
					<Line
						key={s.dimension_value}
						type="monotone"
						dataKey={s.dimension_value}
						name={s.label}
						stroke={DIMENSION_COLORS[i % DIMENSION_COLORS.length]}
						strokeWidth={2}
						dot={false}
						activeDot={{ r: 4 }}
					/>
				))}
			</LineChart>
		</ResponsiveContainer>
	);
}
