import { DEFAULT_LOCALE, withLocalePath } from "@/lib/i18n";
import { redirect } from "next/navigation";

export default function FeedbackRedirect(): never {
	redirect(withLocalePath(DEFAULT_LOCALE, "/feedback"));
}
