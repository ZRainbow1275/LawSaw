"use client";

import { UserShell } from "@/components/layout/user-shell";
import { ReadingHistoryPage } from "@/components/user/reading-history-page";

export default function LocalizedMeReadingHistoryPage() {
	return (
		<UserShell widthVariant="default">
			<ReadingHistoryPage />
		</UserShell>
	);
}
