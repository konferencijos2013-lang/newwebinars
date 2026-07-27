-- -----------------------------------------------------------------
-- Fix missing service_role table privileges
-- -----------------------------------------------------------------
-- service_role currently only has TRUNCATE/TRIGGER/REFERENCES on
-- public tables (no SELECT/INSERT/UPDATE/DELETE), even though it is
-- meant to bypass RLS entirely for Edge Functions using the service
-- role key (create-live-input, end-live-input, cloudflare-stream-webhook,
-- stripe-webhook, create-checkout-session, ai-chat, etc). Postgres RLS
-- bypass (rolbypassrls) does not imply table-level grants, so those
-- functions were failing with "permission denied for table ..." even
-- though the underlying rows existed and the caller was fully
-- authorized at the application level.

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;
