"use client";

import { useT } from "@/lib/i18n-client";
import type { ArticleSentimentCounts } from "@/lib/api/types";
import { SENTIMENT_COLORS } from "../constants";
import {
	Bar,
	BarChart,
	Cell,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

interface SentimentChartProps {
	data: ArticleSentimentCounts;
}

const SENTIMENT_KEYS: Array<keyof ArticleSentimentCounts> = [
	"unknown",
	"positive",
	"neutral",
	"negative",
	"mixed",
];

const SENTIMENT_LABEL_KEYS: Record<string, string> = {
	unknown: "Not analyzed",
	positive: "Positive",
	neutral: "Neutral",
	negative: "Negative",
	mixed: "Mixed",
};

export function SentimentChart({ data }: SentimentChartProps) {
	const t = useT();

	const chartData = SENTIMENT_KEYS.map((key) => ({
		name: t(SENTIMENT_LABEL_KEYS[key]),
		count: data[key],
		fill: SENTIMENT_COLORS[key],
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
