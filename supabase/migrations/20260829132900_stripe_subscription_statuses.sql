-- Add Stripe terminal/delinquent states in a separate transaction before functions use them.
alter type public.subscription_status add value if not exists 'incomplete_expired';
alter type public.subscription_status add value if not exists 'unpaid';
