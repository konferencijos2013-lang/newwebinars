-- New payment providers are added in their own migration.
-- Postgres cannot use a newly added enum value in the same transaction.

alter type public.integration_provider add value if not exists 'paysera';
alter type public.integration_provider add value if not exists 'stripe';
alter type public.integration_provider add value if not exists 'paypal';
