"use client";

import { UserShell } from "@/components/layout/user-shell";
import { NotificationCenterPage } from "@/components/notifications/notification-center-page";

export default function NotificationsPage() {
	return (
		<UserShell widthVariant="default">
			<NotificationCenterPage />
		</UserShell>
	);
}
