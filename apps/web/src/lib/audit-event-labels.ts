import { type Locale, t } from "./i18n";

const eventKeys: Record<string, string> = {
	"apikeys.create": "Audit event: apikeys create",
	"apikeys.delete": "Audit event: apikeys delete",
	"apikeys.revoke": "Audit event: apikeys revoke",
	"articles.archive": "Audit event: articles archive",
	"articles.delete": "Audit event: articles delete",
	"articles.publish": "Audit event: articles publish",
	"articles.restore": "Audit event: articles restore",
	"articles.status.batch_update": "Audit event: articles status batch update",
	"articles.update": "Audit event: articles update",
	"auth.email_verification.confirm":
		"Audit event: auth email verification confirm",
	"auth.email_verification.request":
		"Audit event: auth email verification request",
	"auth.login": "Audit event: auth login",
	"auth.logout": "Audit event: auth logout",
	"auth.mfa.challenge_issued": "Audit event: auth mfa challenge issued",
	"auth.mfa.confirm": "Audit event: auth mfa confirm",
	"auth.mfa.disable": "Audit event: auth mfa disable",
	"auth.mfa.setup": "Audit event: auth mfa setup",
	"auth.mfa.verify": "Audit event: auth mfa verify",
	"auth.oauth.callback": "Audit event: auth oauth callback",
	"auth.oauth.start": "Audit event: auth oauth start",
	"auth.password_reset.confirm": "Audit event: auth password reset confirm",
	"auth.password_reset.request": "Audit event: auth password reset request",
	"auth.register": "Audit event: auth register",
	"authz.relation.create": "Audit event: authz relation create",
	"authz.relation.delete": "Audit event: authz relation delete",
	"banners.create": "Audit event: banners create",
	"banners.update": "Audit event: banners update",
	"categories.create": "Audit event: categories create",
	"categories.delete": "Audit event: categories delete",
	"categories.import": "Audit event: categories import",
	"categories.reorder": "Audit event: categories reorder",
	"categories.update": "Audit event: categories update",
	"channels.create": "Audit event: channels create",
	"channels.policy.create": "Audit event: channels policy create",
	"channels.policy.delete": "Audit event: channels policy delete",
	"channels.policy.update": "Audit event: channels policy update",
	"channels.update": "Audit event: channels update",
	"feedbacks.create": "Audit event: feedbacks create",
	"feedbacks.update": "Audit event: feedbacks update",
	"objects.download": "Audit event: objects download",
	"objects.upload": "Audit event: objects upload",
	"push.subscribe": "Audit event: push subscribe",
	"push.unsubscribe": "Audit event: push unsubscribe",
	"report_subscriptions.create": "Audit event: report subscriptions create",
	"report_subscriptions.delete": "Audit event: report subscriptions delete",
	"report_subscriptions.trigger": "Audit event: report subscriptions trigger",
	"report_subscriptions.update": "Audit event: report subscriptions update",
	"sources.create": "Audit event: sources create",
	"sources.delete": "Audit event: sources delete",
	"sources.fetch.enqueue": "Audit event: sources fetch enqueue",
	"sources.patch": "Audit event: sources patch",
	"sources.restore": "Audit event: sources restore",
	"sources.run.enqueue": "Audit event: sources run enqueue",
	"super_tenants.admin_reset_password":
		"Audit event: super tenants admin reset password",
	"super_tenants.create": "Audit event: super tenants create",
	"super_tenants.delete": "Audit event: super tenants delete",
	"super_tenants.export": "Audit event: super tenants export",
	"super_tenants.suspend": "Audit event: super tenants suspend",
	"super_tenants.update": "Audit event: super tenants update",
	"tenants.config.update": "Audit event: tenants config update",
	"tenants.create": "Audit event: tenants create",
	"tenants.delete": "Audit event: tenants delete",
	"tenants.update": "Audit event: tenants update",
	"tenants.usage.refresh": "Audit event: tenants usage refresh",
	"users.avatar.upload": "Audit event: users avatar upload",
	"users.password.change": "Audit event: users password change",
	"users.roles.update": "Audit event: users roles update",
	"webhooks.create": "Audit event: webhooks create",
	"webhooks.delete": "Audit event: webhooks delete",
	"webhooks.test": "Audit event: webhooks test",
	"webhooks.update": "Audit event: webhooks update",
};

export function localizeAuditEvent(locale: Locale, event: string): string {
	if (!event) return event;
	const exact = eventKeys[event];
	if (exact) return t(locale, exact);
	if (event.startsWith("banners.lifecycle.")) {
		return t(locale, "Audit event: banners lifecycle");
	}
	return event;
}
