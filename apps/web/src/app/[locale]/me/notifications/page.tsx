"use client";

import { UserShell } from "@/components/layout/user-shell";
import { NotificationCenterPage } from "@/components/notifications/notification-center-page";

export default function LocalizedNotificationsPage() {
	return (
		<UserShell widthVariant="default">
			<NotificationCenterPage />
		</UserShell>
	);
}
