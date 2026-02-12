"use client";

import { useT } from "@/lib/i18n-client";
import type { ArticleTrendPoint } from "@/lib/api/types";
import { type Locale, formatDateTime } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";
import {
	Area,
	AreaChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

interface TrendChartProps {
	data: ArticleTrendPoint[];
}

function formatIsoMonthDay(locale: Locale, dateIso: string) {
	const parts = dateIso.split("-");
	if (parts.length !== 3) return dateIso;

	const year = Number(parts[0]);
	const month = Number(parts[1]);
	const day = Number(parts[2]);
	if (
		!Number.isFinite(year) ||
		!Number.isFinite(month) ||
		!Number.isFinite(day)
	)
		return dateIso;

	const date = new Date(Date.UTC(year, month - 1, day));
	return formatDateTime(locale, date, {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

export function TrendChart({ data }: TrendChartProps) {
	const t = useT();
	const locale = useLocale();

	const chartData = data.map((point) => ({
		date: formatIsoMonthDay(locale, point.date),
		count: point.count,
	}));

	return (
		<ResponsiveContainer width="100%" height={260}>
			<AreaChart
				data={chartData}
				margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
			>
				<defs>
					<linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
						<stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
						<stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
					</linearGradient>
				</defs>
				<XAxis
					dataKey="date"
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
					formatter={(value: number) => [value, t("Articles")]}
					contentStyle={{
						borderRadius: "8px",
						border: "1px solid #e5e5e5",
						fontSize: "13px",
					}}
				/>
				<Area
					type="monotone"
					dataKey="count"
					stroke="#3b82f6"
					strokeWidth={2}
					fill="url(#trendGradient)"
				/>
			</AreaChart>
		</ResponsiveContainer>
	);
}
