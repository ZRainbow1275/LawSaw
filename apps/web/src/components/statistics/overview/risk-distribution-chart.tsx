"use client";

import { useT } from "@/lib/i18n-client";
import type { ArticleRiskCounts } from "@/lib/api/types";
import { RISK_COLORS } from "../constants";
import {
	Bar,
	BarChart,
	Cell,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

interface RiskDistributionChartProps {
	data: ArticleRiskCounts;
}

const RISK_KEYS: Array<keyof ArticleRiskCounts> = [
	"unknown",
	"low",
	"medium",
	"high",
	"critical",
];

const RISK_LABEL_KEYS: Record<string, string> = {
	unknown: "Not assessed",
	low: "Low risk",
	medium: "Medium risk",
	high: "High risk",
	critical: "Critical",
};

export function RiskDistributionChart({ data }: RiskDistributionChartProps) {
	const t = useT();

	const chartData = RISK_KEYS.map((key) => ({
		name: t(RISK_LABEL_KEYS[key]),
		count: data[key],
		fill: RISK_COLORS[key],
	}));

	return (
		<ResponsiveContainer width="100%" height={260}>
			<BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
				<XAxis
					dataKey="name"
					tick={{ fontSize: 12 }}
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
					formatter={(value: number) => [value, t("Count")]}
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
