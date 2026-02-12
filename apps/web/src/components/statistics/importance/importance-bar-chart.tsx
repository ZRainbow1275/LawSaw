"use client";

import { useT } from "@/lib/i18n-client";
import { IMPORTANCE_COLORS, IMPORTANCE_LABELS } from "../constants";
import {
	Bar,
	BarChart,
	Cell,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

interface ImportanceBarChartProps {
	levels: [number, number, number, number, number];
}

export function ImportanceBarChart({ levels }: ImportanceBarChartProps) {
	const t = useT();

	const chartData = levels.map((count, i) => ({
		name: IMPORTANCE_LABELS[i],
		count,
		fill: IMPORTANCE_COLORS[i],
		level: i + 1,
	}));

	return (
		<ResponsiveContainer width="100%" height={300}>
			<BarChart
				data={chartData}
				margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
			>
				<XAxis
					dataKey="name"
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
					formatter={(value) => [String(value), t("Count")]}
					contentStyle={{
						borderRadius: "8px",
						border: "1px solid #e5e5e5",
						fontSize: "13px",
					}}
				/>
				<Bar dataKey="count" radius={[4, 4, 0, 0]}>
					{chartData.map((entry) => (
						<Cell key={entry.name} fill={entry.fill} />
					))}
				</Bar>
			</BarChart>
		</ResponsiveContainer>
	);
}
