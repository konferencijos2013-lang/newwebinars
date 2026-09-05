-- Enum values must be committed before later migrations can use them.
alter type public.integration_provider add value if not exists 'telegram';
