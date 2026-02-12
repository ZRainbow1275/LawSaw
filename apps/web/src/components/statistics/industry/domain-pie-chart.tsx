"use client";

import { useT } from "@/lib/i18n-client";
import type { DomainCount } from "@/hooks/use-statistics";
import { DOMAIN_COLORS, DOMAIN_LABELS } from "../constants";
import {
	Cell,
	Legend,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
} from "recharts";

interface DomainPieChartProps {
	items: DomainCount[];
}

export function DomainPieChart({ items }: DomainPieChartProps) {
	const t = useT();

	const chartData = items.map((item) => ({
		name: DOMAIN_LABELS[item.domain_root] ?? item.label,
		value: item.count,
		fill: DOMAIN_COLORS[item.domain_root] ?? "#94a3b8",
	}));

	return (
		<ResponsiveContainer width="100%" height={350}>
			<PieChart>
				<Pie
					data={chartData}
					dataKey="value"
					nameKey="name"
					cx="50%"
					cy="50%"
					outerRadius={120}
					innerRadius={60}
					paddingAngle={2}
				>
					{chartData.map((entry) => (
						<Cell key={entry.name} fill={entry.fill} />
					))}
				</Pie>
				<Tooltip
					formatter={(value: number) => [value, t("Articles")]}
					contentStyle={{
						borderRadius: "8px",
						border: "1px solid #e5e5e5",
						fontSize: "13px",
					}}
				/>
				<Legend
					verticalAlign="bottom"
					height={36}
					iconType="circle"
					formatter={(value: string) => (
						<span className="text-xs text-neutral-600">{value}</span>
					)}
				/>
			</PieChart>
		</ResponsiveContainer>
	);
}
