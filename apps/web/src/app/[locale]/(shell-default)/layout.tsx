import type { ReactNode } from "react";

/**
 * `(shell-default)` route group — pages that opt into the standard `max-w-7xl`
 * container under the persistent user shell.
 *
 * Members: `me/`, `feedback/`, `analytics/`.
 *
 * The locale-level `<PersistentUserShell>` already renders Sidebar + Header
 * AND owns the outer `<main>` element (wave 9 hot-fix #4). This layout only
 * owns the content container width — wrapping in another `<main>` would
 * produce nested landmarks, which is invalid and confuses screen readers.
 * Nesting another ProtectedRoute / Sidebar / Header here would re-introduce
 * the double-mount we are explicitly trying to remove.
 */
export default function ShellDefaultLayout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<div className="mx-auto w-full max-w-7xl px-4 pb-6 pt-4 md:px-6 md:pb-8 md:pt-5">
			{children}
		</div>
	);
}
