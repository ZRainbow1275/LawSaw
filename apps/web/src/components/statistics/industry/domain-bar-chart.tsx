"use client";

import { useT } from "@/lib/i18n-client";
import type { DomainCount } from "@/hooks/use-statistics";
import { DOMAIN_COLORS, DOMAIN_LABELS } from "../constants";
import {
	Bar,
	BarChart,
	Cell,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

interface DomainBarChartProps {
	items: DomainCount[];
}

export function DomainBarChart({ items }: DomainBarChartProps) {
	const t = useT();

	const chartData = items.map((item) => ({
		name: DOMAIN_LABELS[item.domain_root] ?? item.label,
		count: item.count,
		percentage: item.percentage,
		fill: DOMAIN_COLORS[item.domain_root] ?? "#94a3b8",
	}));

	return (
		<ResponsiveContainer width="100%" height={350}>
			<BarChart
				data={chartData}
				layout="vertical"
				margin={{ top: 8, right: 40, bottom: 8, left: 80 }}
			>
				<XAxis
					type="number"
					allowDecimals={false}
					tick={{ fontSize: 12 }}
					axisLine={false}
					tickLine={false}
				/>
				<YAxis
					type="category"
					dataKey="name"
					tick={{ fontSize: 12 }}
					axisLine={false}
					tickLine={false}
					width={80}
				/>
				<Tooltip
					formatter={(value) => [String(value), t("Articles")]}
					contentStyle={{
						borderRadius: "8px",
						border: "1px solid #e5e5e5",
						fontSize: "13px",
					}}
				/>
				<Bar dataKey="count" radius={[0, 4, 4, 0]}>
					{chartData.map((entry) => (
						<Cell key={entry.name} fill={entry.fill} />
					))}
				</Bar>
			</BarChart>
		</ResponsiveContainer>
	);
}
