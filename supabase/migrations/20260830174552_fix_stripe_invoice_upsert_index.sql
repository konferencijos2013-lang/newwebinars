drop index if exists public.payments_stripe_invoice_id_unique;
create unique index payments_stripe_invoice_id_unique
  on public.payments (stripe_invoice_id);
