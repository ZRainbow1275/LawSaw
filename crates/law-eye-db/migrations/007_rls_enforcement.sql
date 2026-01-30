-- 007_rls_enforcement.sql
-- Enforce RLS by executing queries under a non-superuser role.
--
-- Why:
-- - Postgres RLS is bypassed for SUPERUSER and BYPASSRLS roles.
-- - In local/dev compose, the app often connects as the bootstrap superuser (e.g. POSTGRES_USER),
--   which silently disables tenant isolation even if RLS policies exist.
--
-- Strategy:
-- - Create a dedicated NOLOGIN role `law_eye_app` (non-superuser, non-bypassrls).
-- - Grant it the minimum DML privileges required by the application.
-- - The application can then `SET ROLE law_eye_app` on each connection/transaction.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'law_eye_app') THEN
        CREATE ROLE law_eye_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
        RAISE NOTICE 'Created role law_eye_app (NOLOGIN, NOSUPERUSER, NOBYPASSRLS).';
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO law_eye_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO law_eye_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO law_eye_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO law_eye_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES TO law_eye_app;
