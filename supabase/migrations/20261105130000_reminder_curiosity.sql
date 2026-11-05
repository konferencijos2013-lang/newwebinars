-- Curiosity subjects and opening lines for untouched standard reminders.
-- Bullets come from the webinar description when it has enough sentences.

create or replace function public.reminder_followup_context(p_registration_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_joined timestamptz;
  v_webinar_id uuid;
  v_starts_at timestamptz;
  v_type text;
  v_language text;
  v_description text;
  v_offer text;
  v_next timestamptz;
  v_schedule_type text;
  v_rule text;
  v_timezone text;
begin
  select reg.joined_webinar_at, reg.webinar_id, session.starts_at
    into v_joined, v_webinar_id, v_starts_at
  from public.registrations reg
  left join public.webinar_sessions session on session.id = reg.session_id
  where reg.id = p_registration_id;
  if v_webinar_id is null then
    return '{}'::jsonb;
  end if;

  select webinar.type, webinar.language, webinar.description
    into v_type, v_language, v_description
  from public.webinars webinar
  where webinar.id = v_webinar_id;

  select offer.target_url into v_offer
  from public.webinar_offers offer
  where offer.webinar_id = v_webinar_id
    and offer.active
    and offer.target_url is not null
  order by offer.updated_at desc
  limit 1;

  select session.starts_at into v_next
  from public.webinar_sessions session
  where session.webinar_id = v_webinar_id
    and session.starts_at is not null
    and session.starts_at > coalesce(v_starts_at, now())
  order by session.starts_at
  limit 1;

  select schedule.schedule_type::text, schedule.recurrence_rule, schedule.timezone
    into v_schedule_type, v_rule, v_timezone
  from public.webinar_schedules schedule
  where schedule.webinar_id = v_webinar_id
    and schedule.is_active
  order by schedule.created_at
  limit 1;

  return jsonb_build_object(
    'attended', v_joined is not null,
    'offer_link', v_offer,
    'webinar_type', v_type,
    'language', coalesce(v_language, 'lt'),
    'description', v_description,
    'schedule_type', v_schedule_type,
    'recurrence_rule', v_rule,
    'timezone', coalesce(v_timezone, 'Europe/Vilnius'),
    'session_starts_at', v_starts_at,
    'next_fixed_start', v_next
  );
end;
$$;

update public.reminder_rules as rule
set subject = next.subject,
    body = next.body,
    updated_at = now()
from (
  values
    (
      'Užsiregistravote: {{webinar_title}}',
      E'Sveiki, {{name}},\n\njūs užsiregistravote į „{{webinar_title}}“.\n\nPradžia: {{starts_at}}\n\nJūsų prisijungimo nuoroda:\n{{webinar_link}}',
      'Ko „{{webinar_title}}“ pavadinimas jums nepasako',
      E'Sveiki, {{name}},\n\npavadinimas pasako temą. Jis nutyli tą vietą, dėl kurios vėliau sakoma: šitą reikėjo išgirsti gyvai.\n\n{{highlights}}Pradžia: {{starts_at}}\n\nPrisijungimo nuoroda:\n{{webinar_link}}'
    ),
    (
      'Užsiregistravote: {{webinar_title}}',
      E'Sveiki, {{name}}! Jūs užsiregistravote į „{{webinar_title}}“. Pradžia: {{starts_at}}. Prisijungti: {{webinar_link}}',
      'Ko „{{webinar_title}}“ pavadinimas jums nepasako',
      E'{{name}}, „{{webinar_title}}“ pavadinimas nutyli svarbiausią vietą. Pradžia: {{starts_at}}. {{webinar_link}}'
    ),
    (
      'You are registered: {{webinar_title}}',
      E'Hello {{name}},\n\nyou are registered for "{{webinar_title}}".\n\nStarts: {{starts_at}}\n\nYour join link:\n{{webinar_link}}',
      'What the title "{{webinar_title}}" leaves out',
      E'Hello {{name}},\n\nthe title names the topic. It stays quiet about the part people later wish they had heard live.\n\n{{highlights}}Starts: {{starts_at}}\n\nYour join link:\n{{webinar_link}}'
    ),
    (
      'You are registered: {{webinar_title}}',
      E'Hello {{name}}! You are registered for "{{webinar_title}}". Starts: {{starts_at}}. Join: {{webinar_link}}',
      'What the title "{{webinar_title}}" leaves out',
      E'{{name}}, the title "{{webinar_title}}" leaves out the part that matters. Starts: {{starts_at}}. {{webinar_link}}'
    ),
    (
      'Вы зарегистрированы: {{webinar_title}}',
      E'Здравствуйте, {{name}}!\n\nВы зарегистрировались на «{{webinar_title}}».\n\nНачало: {{starts_at}}\n\nВаша ссылка для входа:\n{{webinar_link}}',
      'Чего не говорит название «{{webinar_title}}»',
      E'Здравствуйте, {{name}}!\n\nНазвание называет тему. Оно молчит о том месте, которое потом хочется услышать вживую.\n\n{{highlights}}Начало: {{starts_at}}\n\nВаша ссылка для входа:\n{{webinar_link}}'
    ),
    (
      'Вы зарегистрированы: {{webinar_title}}',
      E'Здравствуйте, {{name}}! Вы зарегистрировались на «{{webinar_title}}». Начало: {{starts_at}}. Войти: {{webinar_link}}',
      'Чего не говорит название «{{webinar_title}}»',
      E'{{name}}, название «{{webinar_title}}» молчит о самом важном. Начало: {{starts_at}}. {{webinar_link}}'
    ),
    (
      'Rytoj: {{webinar_title}}',
      E'Sveiki, {{name}},\n\nrytoj vyks „{{webinar_title}}“.\n\nPradžia: {{starts_at}}\n\nJūsų prisijungimo nuoroda:\n{{webinar_link}}',
      'Rytoj paaiškės tai, ko „{{webinar_title}}“ anonsas nerodo',
      E'Sveiki, {{name}},\n\nrytoj skirtumas bus ne kalendoriuje. Skirtumas bus tas, ar būsite kambaryje, kai pasakys tai, ko skelbime nėra.\n\n{{highlights}}Pradžia: {{starts_at}}\n\nPrisijungimo nuoroda:\n{{webinar_link}}'
    ),
    (
      'Rytoj: {{webinar_title}}',
      E'Sveiki, {{name}}! Rytoj vyks „{{webinar_title}}“. Pradžia: {{starts_at}}. Prisijungti: {{webinar_link}}',
      'Rytoj paaiškės tai, ko „{{webinar_title}}“ anonsas nerodo',
      E'{{name}}, rytoj „{{webinar_title}}“ pasakys tai, ko skelbime nėra. Pradžia: {{starts_at}}. {{webinar_link}}'
    ),
    (
      'Tomorrow: {{webinar_title}}',
      E'Hello {{name}},\n\n"{{webinar_title}}" is tomorrow.\n\nStarts: {{starts_at}}\n\nYour join link:\n{{webinar_link}}',
      'Tomorrow "{{webinar_title}}" shows what the announcement hides',
      E'Hello {{name}},\n\ntomorrow the difference is not the calendar. The difference is whether you are in the room when they say what the announcement left out.\n\n{{highlights}}Starts: {{starts_at}}\n\nYour join link:\n{{webinar_link}}'
    ),
    (
      'Tomorrow: {{webinar_title}}',
      E'Hello {{name}}! "{{webinar_title}}" is tomorrow. Starts: {{starts_at}}. Join: {{webinar_link}}',
      'Tomorrow "{{webinar_title}}" shows what the announcement hides',
      E'{{name}}, tomorrow "{{webinar_title}}" says what the announcement left out. Starts: {{starts_at}}. {{webinar_link}}'
    ),
    (
      'Завтра: {{webinar_title}}',
      E'Здравствуйте, {{name}}!\n\nЗавтра пройдёт «{{webinar_title}}».\n\nНачало: {{starts_at}}\n\nВаша ссылка для входа:\n{{webinar_link}}',
      'Завтра «{{webinar_title}}» покажет то, чего нет в анонсе',
      E'Здравствуйте, {{name}}!\n\nзавтра разница будет не в календаре. Разница в том, будете ли вы в комнате, когда скажут то, чего нет в анонсе.\n\n{{highlights}}Начало: {{starts_at}}\n\nВаша ссылка для входа:\n{{webinar_link}}'
    ),
    (
      'Завтра: {{webinar_title}}',
      E'Здравствуйте, {{name}}! Завтра пройдёт «{{webinar_title}}». Начало: {{starts_at}}. Войти: {{webinar_link}}',
      'Завтра «{{webinar_title}}» покажет то, чего нет в анонсе',
      E'{{name}}, завтра «{{webinar_title}}» скажет то, чего нет в анонсе. Начало: {{starts_at}}. {{webinar_link}}'
    ),
    (
      'Po valandos: {{webinar_title}}',
      E'Sveiki, {{name}},\n\n„{{webinar_title}}“ prasidės po valandos.\n\nPradžia: {{starts_at}}\n\nJūsų prisijungimo nuoroda:\n{{webinar_link}}',
      'Liko valanda. „{{webinar_title}}“ prasidės su jumis arba be jūsų',
      E'Sveiki, {{name}},\n\npo valandos pirma mintis nuskambės vieną kartą. Vėliau ją tenka dėlioti iš to, ką kiti jau suprato.\n\n{{highlights}}Pradžia: {{starts_at}}\n\nPrisijungimo nuoroda:\n{{webinar_link}}'
    ),
    (
      'Po valandos: {{webinar_title}}',
      E'Sveiki, {{name}}! „{{webinar_title}}“ prasidės po valandos. Pradžia: {{starts_at}}. Prisijungti: {{webinar_link}}',
      'Liko valanda. „{{webinar_title}}“ prasidės su jumis arba be jūsų',
      E'{{name}}, po valandos „{{webinar_title}}“ pasakys pirmą mintį vieną kartą. Pradžia: {{starts_at}}. {{webinar_link}}'
    ),
    (
      'In one hour: {{webinar_title}}',
      E'Hello {{name}},\n\n"{{webinar_title}}" starts in one hour.\n\nStarts: {{starts_at}}\n\nYour join link:\n{{webinar_link}}',
      'One hour left. "{{webinar_title}}" starts with you or without you',
      E'Hello {{name}},\n\nin one hour the opening idea is said once. After that you rebuild it from what everyone else already understood.\n\n{{highlights}}Starts: {{starts_at}}\n\nYour join link:\n{{webinar_link}}'
    ),
    (
      'In one hour: {{webinar_title}}',
      E'Hello {{name}}! "{{webinar_title}}" starts in one hour. Starts: {{starts_at}}. Join: {{webinar_link}}',
      'One hour left. "{{webinar_title}}" starts with you or without you',
      E'{{name}}, in one hour "{{webinar_title}}" says the opening idea once. Starts: {{starts_at}}. {{webinar_link}}'
    ),
    (
      'Через час: {{webinar_title}}',
      E'Здравствуйте, {{name}}!\n\n«{{webinar_title}}» начнётся через час.\n\nНачало: {{starts_at}}\n\nВаша ссылка для входа:\n{{webinar_link}}',
      'Остался час. «{{webinar_title}}» начнётся с вами или без вас',
      E'Здравствуйте, {{name}}!\n\nчерез час первую мысль скажут один раз. Потом её приходится собирать из того, что остальные уже поняли.\n\n{{highlights}}Начало: {{starts_at}}\n\nВаша ссылка для входа:\n{{webinar_link}}'
    ),
    (
      'Через час: {{webinar_title}}',
      E'Здравствуйте, {{name}}! «{{webinar_title}}» начнётся через час. Начало: {{starts_at}}. Войти: {{webinar_link}}',
      'Остался час. «{{webinar_title}}» начнётся с вами или без вас',
      E'{{name}}, через час «{{webinar_title}}» скажет первую мысль один раз. Начало: {{starts_at}}. {{webinar_link}}'
    ),
    (
      'Po 15 minučių: {{webinar_title}}',
      E'Sveiki, {{name}},\n\n„{{webinar_title}}“ prasidės po 15 minučių.\n\nPradžia: {{starts_at}}\n\nJūsų prisijungimo nuoroda:\n{{webinar_link}}',
      'Dar 15 minučių, ir „{{webinar_title}}“ prasideda',
      E'Sveiki, {{name}},\n\npirmos minutės būna trumpos. Būtent jas vėliau tenka atsukti mintyse, jei jų negirdėjote.\n\n{{highlights}}Pradžia: {{starts_at}}\n\nPrisijungimo nuoroda:\n{{webinar_link}}'
    ),
    (
      'Po 15 minučių: {{webinar_title}}',
      E'Sveiki, {{name}}! „{{webinar_title}}“ prasidės po 15 minučių. Pradžia: {{starts_at}}. Prisijungti: {{webinar_link}}',
      'Dar 15 minučių, ir „{{webinar_title}}“ prasideda',
      E'{{name}}, po 15 minučių „{{webinar_title}}“ pradeda nuo trumpos pirmos minties. Pradžia: {{starts_at}}. {{webinar_link}}'
    ),
    (
      'In 15 minutes: {{webinar_title}}',
      E'Hello {{name}},\n\n"{{webinar_title}}" starts in 15 minutes.\n\nStarts: {{starts_at}}\n\nYour join link:\n{{webinar_link}}',
      '15 minutes until "{{webinar_title}}" opens',
      E'Hello {{name}},\n\nthe first minutes are short. Those are the ones you later replay in your head if you missed them.\n\n{{highlights}}Starts: {{starts_at}}\n\nYour join link:\n{{webinar_link}}'
    ),
    (
      'In 15 minutes: {{webinar_title}}',
      E'Hello {{name}}! "{{webinar_title}}" starts in 15 minutes. Starts: {{starts_at}}. Join: {{webinar_link}}',
      '15 minutes until "{{webinar_title}}" opens',
      E'{{name}}, in 15 minutes "{{webinar_title}}" opens with a short first idea. Starts: {{starts_at}}. {{webinar_link}}'
    ),
    (
      'Через 15 минут: {{webinar_title}}',
      E'Здравствуйте, {{name}}!\n\n«{{webinar_title}}» начнётся через 15 минут.\n\nНачало: {{starts_at}}\n\nВаша ссылка для входа:\n{{webinar_link}}',
      'Ещё 15 минут, и «{{webinar_title}}» начинается',
      E'Здравствуйте, {{name}}!\n\nпервые минуты короткие. Именно их потом прокручиваешь в голове, если не услышал.\n\n{{highlights}}Начало: {{starts_at}}\n\nВаша ссылка для входа:\n{{webinar_link}}'
    ),
    (
      'Через 15 минут: {{webinar_title}}',
      E'Здравствуйте, {{name}}! «{{webinar_title}}» начнётся через 15 минут. Начало: {{starts_at}}. Войти: {{webinar_link}}',
      'Ещё 15 минут, и «{{webinar_title}}» начинается',
      E'{{name}}, через 15 минут «{{webinar_title}}» начнётся с короткой первой мысли. Начало: {{starts_at}}. {{webinar_link}}'
    ),
    (
      'Jau prasidėjo: {{webinar_title}}',
      E'Sveiki, {{name}},\n\n„{{webinar_title}}“ jau prasidėjo. Pradžia: {{starts_at}}\n\nPrisijunkite dabar:\n{{webinar_link}}',
      '„{{webinar_title}}“ jau kalba. Jūsų vieta dar tuščia',
      E'Sveiki, {{name}},\n\nkambarys jau atidarytas. Kuo ilgiau stovite už durų, tuo daugiau pirmos dalies tenka suprasti iš nuotrupų.\n\n{{highlights}}Pradžia buvo: {{starts_at}}\n\nĮeiti dabar:\n{{webinar_link}}'
    ),
    (
      'Jau prasidėjo: {{webinar_title}}',
      E'Sveiki, {{name}}! „{{webinar_title}}“ jau prasidėjo. Pradžia: {{starts_at}}. Prisijungti: {{webinar_link}}',
      '„{{webinar_title}}“ jau kalba. Jūsų vieta dar tuščia',
      E'{{name}}, „{{webinar_title}}“ jau kalba, o jūsų vieta tuščia. {{webinar_link}}'
    ),
    (
      'Started: {{webinar_title}}',
      E'Hello {{name}},\n\n"{{webinar_title}}" has started. Starts: {{starts_at}}\n\nJoin now:\n{{webinar_link}}',
      '"{{webinar_title}}" is already talking. Your seat is still empty',
      E'Hello {{name}},\n\nthe room is open. The longer you stay outside, the more of the opening you have to piece together from fragments.\n\n{{highlights}}Started: {{starts_at}}\n\nCome in now:\n{{webinar_link}}'
    ),
    (
      'Started: {{webinar_title}}',
      E'Hello {{name}}! "{{webinar_title}}" has started. Starts: {{starts_at}}. Join: {{webinar_link}}',
      '"{{webinar_title}}" is already talking. Your seat is still empty',
      E'{{name}}, "{{webinar_title}}" is already talking and your seat is empty. {{webinar_link}}'
    ),
    (
      'Уже началось: {{webinar_title}}',
      E'Здравствуйте, {{name}}!\n\n«{{webinar_title}}» уже начался. Начало: {{starts_at}}\n\nПодключайтесь сейчас:\n{{webinar_link}}',
      '«{{webinar_title}}» уже говорит. Ваше место ещё пустое',
      E'Здравствуйте, {{name}}!\n\nкомната уже открыта. Чем дольше вы за дверью, тем больше начала приходится собирать по обрывкам.\n\n{{highlights}}Начало было: {{starts_at}}\n\nВойти сейчас:\n{{webinar_link}}'
    ),
    (
      'Уже началось: {{webinar_title}}',
      E'Здравствуйте, {{name}}! «{{webinar_title}}» уже начался. Начало: {{starts_at}}. Войти: {{webinar_link}}',
      '«{{webinar_title}}» уже говорит. Ваше место ещё пустое',
      E'{{name}}, «{{webinar_title}}» уже говорит, а ваше место пустое. {{webinar_link}}'
    ),
    (
      'Pasiūlymas po „{{webinar_title}}“',
      E'Sveiki, {{name}},\n\načiū, kad dalyvavote „{{webinar_title}}“.\n\nPasiūlymą rasite čia:\n{{offer_link}}',
      'Matėte „{{webinar_title}}“. Vienas žingsnis dar liko',
      E'Sveiki, {{name}},\n\nžiūrėjimas nieko nepakeičia, kol nepadarote to žingsnio, kurį vebinare parodė kaip kitą.\n\n{{highlights}}Kitas žingsnis:\n{{offer_link}}'
    ),
    (
      'Pasiūlymas po „{{webinar_title}}“',
      E'Sveiki, {{name}}! Ačiū, kad dalyvavote „{{webinar_title}}“. Pasiūlymas: {{offer_link}}',
      'Matėte „{{webinar_title}}“. Vienas žingsnis dar liko',
      E'{{name}}, „{{webinar_title}}“ jau pasibaigė, o vienas žingsnis dar liko. {{offer_link}}'
    ),
    (
      'Your offer after "{{webinar_title}}"',
      E'Hello {{name}},\n\nthank you for attending "{{webinar_title}}".\n\nThe offer is here:\n{{offer_link}}',
      'You saw "{{webinar_title}}". One step is still open',
      E'Hello {{name}},\n\nwatching changes nothing until you take the step the webinar pointed to next.\n\n{{highlights}}The next step:\n{{offer_link}}'
    ),
    (
      'Your offer after "{{webinar_title}}"',
      E'Hello {{name}}! Thank you for attending "{{webinar_title}}". Offer: {{offer_link}}',
      'You saw "{{webinar_title}}". One step is still open',
      E'{{name}}, "{{webinar_title}}" is over and one step is still open. {{offer_link}}'
    ),
    (
      'Предложение после «{{webinar_title}}»',
      E'Здравствуйте, {{name}}!\n\nСпасибо, что были на «{{webinar_title}}».\n\nПредложение здесь:\n{{offer_link}}',
      'Вы видели «{{webinar_title}}». Один шаг ещё остался',
      E'Здравствуйте, {{name}}!\n\nпросмотр ничего не меняет, пока вы не делаете тот шаг, который на вебинаре показали следующим.\n\n{{highlights}}Следующий шаг:\n{{offer_link}}'
    ),
    (
      'Предложение после «{{webinar_title}}»',
      E'Здравствуйте, {{name}}! Спасибо, что были на «{{webinar_title}}». Предложение: {{offer_link}}',
      'Вы видели «{{webinar_title}}». Один шаг ещё остался',
      E'{{name}}, «{{webinar_title}}» закончился, а один шаг ещё остался. {{offer_link}}'
    ),
    (
      '„{{webinar_title}}“ kartosis',
      E'Sveiki, {{name}},\n\nšį kartą „{{webinar_title}}“ praleidote. Kitas laikas: {{next_session}}.\n\nRegistracija:\n{{public_webinar_link}}',
      'Jūsų nebuvo „{{webinar_title}}“. Turinys niekur nedingo',
      E'Sveiki, {{name}},\n\nšį kartą salė praėjo be jūsų. Kitas laikas yra tas pats vebinaras, ne kitas pažadas.\n\n{{highlights}}Kitas laikas: {{next_session}}\n\nRegistracija:\n{{public_webinar_link}}'
    ),
    (
      '„{{webinar_title}}“ kartosis',
      E'Sveiki, {{name}}! „{{webinar_title}}“ šį kartą praleidote. Kitas laikas: {{next_session}}. {{public_webinar_link}}',
      'Jūsų nebuvo „{{webinar_title}}“. Turinys niekur nedingo',
      E'{{name}}, „{{webinar_title}}“ šį kartą praėjo be jūsų. Kitas laikas: {{next_session}}. {{public_webinar_link}}'
    ),
    (
      '"{{webinar_title}}" will run again',
      E'Hello {{name}},\n\nyou missed "{{webinar_title}}" this time. Next time: {{next_session}}.\n\nRegistration:\n{{public_webinar_link}}',
      'You missed "{{webinar_title}}". The content is still there',
      E'Hello {{name}},\n\nthis time the room went on without you. The next time is the same webinar, not a different promise.\n\n{{highlights}}Next time: {{next_session}}\n\nRegistration:\n{{public_webinar_link}}'
    ),
    (
      '"{{webinar_title}}" will run again',
      E'Hello {{name}}! You missed "{{webinar_title}}" this time. Next time: {{next_session}}. {{public_webinar_link}}',
      'You missed "{{webinar_title}}". The content is still there',
      E'{{name}}, "{{webinar_title}}" went on without you this time. Next time: {{next_session}}. {{public_webinar_link}}'
    ),
    (
      '«{{webinar_title}}» повторится',
      E'Здравствуйте, {{name}}!\n\nВ этот раз вы пропустили «{{webinar_title}}». Следующий раз: {{next_session}}.\n\nРегистрация:\n{{public_webinar_link}}',
      'Вас не было на «{{webinar_title}}». Содержание никуда не делось',
      E'Здравствуйте, {{name}}!\n\nв этот раз зал прошёл без вас. Следующий раз — тот же вебинар, а не другое обещание.\n\n{{highlights}}Следующий раз: {{next_session}}\n\nРегистрация:\n{{public_webinar_link}}'
    ),
    (
      '«{{webinar_title}}» повторится',
      E'Здравствуйте, {{name}}! В этот раз вы пропустили «{{webinar_title}}». Следующий раз: {{next_session}}. {{public_webinar_link}}',
      'Вас не было на «{{webinar_title}}». Содержание никуда не делось',
      E'{{name}}, «{{webinar_title}}» в этот раз прошёл без вас. Следующий раз: {{next_session}}. {{public_webinar_link}}'
    )
) as next(old_subject, old_body, subject, body)
where rule.subject = next.old_subject
  and rule.body = next.old_body;
