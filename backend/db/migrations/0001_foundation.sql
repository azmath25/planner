-- Dayframe M2.1: empty private application namespace and migration ledger.
-- Real user-data tables and ownership policies are deferred to M2.2/M2.3.
CREATE SCHEMA IF NOT EXISTS dayframe;
CREATE TABLE IF NOT EXISTS dayframe.schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO dayframe.schema_migrations (version)
VALUES ('0001_foundation')
ON CONFLICT (version) DO NOTHING;
