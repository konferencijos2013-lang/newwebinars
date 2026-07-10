-- ---------------------------------------------------------------------
-- Partner referral enhancements
-- ---------------------------------------------------------------------
-- - Auto-generate a unique referral code on insert when admin leaves it empty.
-- - Keep referral codes immutable after creation.
-- - Codes are normalised to uppercase.
-- ---------------------------------------------------------------------

create or replace function public.generate_partner_code ()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_attempts int := 0;
begin
  loop
    v_attempts := v_attempts + 1;
    if v_attempts > 10 then
      raise exception 'Could not generate a unique partner code after 10 attempts';
    end if;

    v_code := upper (substring (replace (gen_random_uuid ()::text, '-', ''), 1, 8));

    if not exists (select 1 from public.partners where code = v_code) then
      return v_code;
    end if;
  end loop;
end;
$$;

comment on function public.generate_partner_code () is 'Generates a unique uppercase 8-character affiliate code. SECURITY DEFINER so uniqueness checks are not blocked by RLS.';

alter function public.generate_partner_code () owner to postgres;

create or replace function public.trg_partners_handle_code ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.code is null or length (trim (NEW.code)) = 0 then
      NEW.code := public.generate_partner_code ();
    else
      NEW.code := upper (trim (NEW.code));
    end if;
  elsif TG_OP = 'UPDATE' then
    NEW.code := upper (trim (NEW.code));

    if NEW.code is distinct from OLD.code then
      raise exception 'Partner referral code is immutable';
    end if;
  end if;

  return NEW;
end;
$$;

comment on function public.trg_partners_handle_code () is 'Normalises partner codes and enforces immutability after creation.';

alter function public.trg_partners_handle_code () owner to postgres;

drop trigger if exists trg_partners_handle_code on public.partners;

create trigger trg_partners_handle_code
before insert or update on public.partners
for each row execute function public.trg_partners_handle_code ();
