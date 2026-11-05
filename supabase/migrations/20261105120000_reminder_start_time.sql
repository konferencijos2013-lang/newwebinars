-- Put the real session start into standard reminder texts that do not
-- already name it. Hand-written letters without these phrases stay as they are.

update public.reminder_rules
set body = replace(body, 'Jūsų prisijungimo nuoroda:', E'Pradžia: {{starts_at}}\n\nJūsų prisijungimo nuoroda:'),
    updated_at = now()
where body like '%Jūsų prisijungimo nuoroda:%'
  and body not like '%{{starts_at}}%';

update public.reminder_rules
set body = replace(body, 'Prisijunkite dabar:', E'Pradžia: {{starts_at}}\n\nPrisijunkite dabar:'),
    updated_at = now()
where body like '%Prisijunkite dabar:%'
  and body not like '%{{starts_at}}%';

update public.reminder_rules
set body = replace(body, 'Prisijungti: {{webinar_link}}', 'Pradžia: {{starts_at}}. Prisijungti: {{webinar_link}}'),
    updated_at = now()
where body like '%Prisijungti: {{webinar_link}}%'
  and body not like '%{{starts_at}}%';

update public.reminder_rules
set body = replace(body, 'Your join link:', E'Starts: {{starts_at}}\n\nYour join link:'),
    updated_at = now()
where body like '%Your join link:%'
  and body not like '%{{starts_at}}%';

update public.reminder_rules
set body = replace(body, 'Join now:', E'Starts: {{starts_at}}\n\nJoin now:'),
    updated_at = now()
where body like '%Join now:%'
  and body not like '%{{starts_at}}%';

update public.reminder_rules
set body = replace(body, 'Join: {{webinar_link}}', 'Starts: {{starts_at}}. Join: {{webinar_link}}'),
    updated_at = now()
where body like '%Join: {{webinar_link}}%'
  and body not like '%{{starts_at}}%';

update public.reminder_rules
set body = replace(body, 'Ваша ссылка для входа:', E'Начало: {{starts_at}}\n\nВаша ссылка для входа:'),
    updated_at = now()
where body like '%Ваша ссылка для входа:%'
  and body not like '%{{starts_at}}%';

update public.reminder_rules
set body = replace(body, 'Подключайтесь сейчас:', E'Начало: {{starts_at}}\n\nПодключайтесь сейчас:'),
    updated_at = now()
where body like '%Подключайтесь сейчас:%'
  and body not like '%{{starts_at}}%';

update public.reminder_rules
set body = replace(body, 'Войти: {{webinar_link}}', 'Начало: {{starts_at}}. Войти: {{webinar_link}}'),
    updated_at = now()
where body like '%Войти: {{webinar_link}}%'
  and body not like '%{{starts_at}}%';
