import type { ReactNode } from "react";

/**
 * `(shell-default)` route group — pages that opt into the standard `max-w-7xl`
 * container under the persistent user shell.
 *
 * Members: `me/`, `feedback/`, `analytics/`.
 *
 * The locale-level `<PersistentUserShell>` already renders Sidebar + Header;
 * this layout only owns the content container width. Nesting another
 * ProtectedRoute / Sidebar / Header here would re-introduce the double-mount
 * we are explicitly trying to remove.
 */
export default function ShellDefaultLayout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6 md:py-8">
			{children}
		</main>
	);
}
