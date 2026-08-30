-- Bind verified Stripe Live prices to the exact canonical paid plans.
-- Any catalog mismatch or conflicting existing binding aborts the transaction.
do $$
declare
  v_count integer;
begin
  with expected(code, name, price_cents, currency, interval, stripe_price_id) as (
    values
      ('start-month', 'Start', 1900, 'eur', 'month', 'price_1U9q3IF2LhpXxyCbgOLPuRYy'),
      ('start-year', 'Start', 18240, 'eur', 'year', 'price_1U9qA6F2LhpXxyCbIqKhMSsg'),
      ('grow-month', 'Grow', 3900, 'eur', 'month', 'price_1U9qDdF2LhpXxyCblcXf8SnY'),
      ('grow-year', 'Grow', 37440, 'eur', 'year', 'price_1U9qFYF2LhpXxyCbcVZuoATJ'),
      ('scale-month', 'Scale', 7900, 'eur', 'month', 'price_1U9r37F2LhpXxyCbtTaUe99x'),
      ('scale-year', 'Scale', 75840, 'eur', 'year', 'price_1U9r5IF2LhpXxyCbyVArlVoP')
  )
  select count(*) into v_count
  from public.credit_plans p
  join expected e using (code, name, price_cents, currency, interval);

  if v_count <> 6 then
    raise exception 'Expected exactly six canonical paid plan rows with verified amount, currency, and interval; found %', v_count;
  end if;

  if exists (
    with expected(code, stripe_price_id) as (values
      ('start-month', 'price_1U9q3IF2LhpXxyCbgOLPuRYy'), ('start-year', 'price_1U9qA6F2LhpXxyCbIqKhMSsg'),
      ('grow-month', 'price_1U9qDdF2LhpXxyCblcXf8SnY'), ('grow-year', 'price_1U9qFYF2LhpXxyCbcVZuoATJ'),
      ('scale-month', 'price_1U9r37F2LhpXxyCbtTaUe99x'), ('scale-year', 'price_1U9r5IF2LhpXxyCbyVArlVoP')
    )
    select 1 from public.credit_plans p join expected e using (stripe_price_id) where p.code <> e.code
  ) then
    raise exception 'A verified Stripe Live price ID is already bound to a different credit plan';
  end if;

  if exists (
    with expected(code, stripe_price_id) as (values
      ('start-month', 'price_1U9q3IF2LhpXxyCbgOLPuRYy'), ('start-year', 'price_1U9qA6F2LhpXxyCbIqKhMSsg'),
      ('grow-month', 'price_1U9qDdF2LhpXxyCblcXf8SnY'), ('grow-year', 'price_1U9qFYF2LhpXxyCbcVZuoATJ'),
      ('scale-month', 'price_1U9r37F2LhpXxyCbtTaUe99x'), ('scale-year', 'price_1U9r5IF2LhpXxyCbyVArlVoP')
    )
    select 1 from public.credit_plans p join expected e using (code)
    where p.stripe_price_id is not null and p.stripe_price_id <> e.stripe_price_id
  ) then
    raise exception 'A canonical paid plan is already bound to a different Stripe price ID';
  end if;

  with expected(code, name, price_cents, currency, interval, stripe_price_id) as (values
    ('start-month', 'Start', 1900, 'eur', 'month', 'price_1U9q3IF2LhpXxyCbgOLPuRYy'),
    ('start-year', 'Start', 18240, 'eur', 'year', 'price_1U9qA6F2LhpXxyCbIqKhMSsg'),
    ('grow-month', 'Grow', 3900, 'eur', 'month', 'price_1U9qDdF2LhpXxyCblcXf8SnY'),
    ('grow-year', 'Grow', 37440, 'eur', 'year', 'price_1U9qFYF2LhpXxyCbcVZuoATJ'),
    ('scale-month', 'Scale', 7900, 'eur', 'month', 'price_1U9r37F2LhpXxyCbtTaUe99x'),
    ('scale-year', 'Scale', 75840, 'eur', 'year', 'price_1U9r5IF2LhpXxyCbyVArlVoP')
  )
  update public.credit_plans p
  set stripe_price_id = e.stripe_price_id, is_active = true, updated_at = now()
  from expected e
  where p.code = e.code and p.name = e.name and p.price_cents = e.price_cents
    and p.currency = e.currency and p.interval = e.interval;

  get diagnostics v_count = row_count;
  if v_count <> 6 then
    raise exception 'Expected to update exactly six canonical paid plans; updated %', v_count;
  end if;

  with expected(code, stripe_price_id) as (values
    ('start-month', 'price_1U9q3IF2LhpXxyCbgOLPuRYy'), ('start-year', 'price_1U9qA6F2LhpXxyCbIqKhMSsg'),
    ('grow-month', 'price_1U9qDdF2LhpXxyCblcXf8SnY'), ('grow-year', 'price_1U9qFYF2LhpXxyCbcVZuoATJ'),
    ('scale-month', 'price_1U9r37F2LhpXxyCbtTaUe99x'), ('scale-year', 'price_1U9r5IF2LhpXxyCbyVArlVoP')
  )
  select count(*) into v_count
  from public.credit_plans p join expected e using (code, stripe_price_id)
  where p.is_active;

  if v_count <> 6 then
    raise exception 'Postcondition failed: all six canonical paid plans must be active and correctly bound; found %', v_count;
  end if;
end
$$;
