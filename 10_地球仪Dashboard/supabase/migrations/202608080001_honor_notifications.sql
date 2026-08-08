alter table public.archive_notifications
  drop constraint if exists archive_notifications_kind_check;

alter table public.archive_notifications
  add constraint archive_notifications_kind_check
  check (kind in ('submitted', 'approved', 'changes_requested', 'published', 'invite', 'announcement', 'honor'));

create or replace function public.send_honor_notification(
  p_recipient_id uuid,
  p_subject text,
  p_message text
)
returns public.archive_notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile public.profiles;
  sent_notification public.archive_notifications;
  normalized_subject text := trim(coalesce(p_subject, ''));
  normalized_message text := trim(coalesce(p_message, ''));
begin
  if not public.is_admin() then
    raise exception 'Only administrators can send honor notifications'
      using errcode = '42501';
  end if;

  if length(normalized_subject) = 0 or length(normalized_subject) > 160
    or length(normalized_message) = 0 or length(normalized_message) > 4000 then
    raise exception 'Honor notification subject or message is invalid'
      using errcode = '22023';
  end if;

  select * into target_profile
  from public.profiles
  where id = p_recipient_id
    and role = 'clerk'
    and enabled = true;

  if not found then
    raise exception 'Honor notifications can only be sent to enabled clerks'
      using errcode = '22023';
  end if;

  insert into public.archive_notifications (
    recipient_id,
    contribution_id,
    kind,
    sender_label,
    subject,
    message
  ) values (
    target_profile.id,
    null,
    'honor',
    '南极公约监管办公室 / 宣传部授信管理处',
    normalized_subject,
    normalized_message
  ) returning * into sent_notification;

  return sent_notification;
end;
$$;

revoke all on function public.send_honor_notification(uuid, text, text) from public;
grant execute on function public.send_honor_notification(uuid, text, text) to authenticated;

create or replace function public.issue_clerk_honor(
  p_clerk_id uuid,
  p_ribbon_id uuid,
  p_title text,
  p_category text,
  p_description text
)
returns public.clerk_honors
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile public.profiles;
  saved_award public.clerk_honors;
  normalized_title text := trim(coalesce(p_title, ''));
  normalized_category text := trim(coalesce(p_category, ''));
  normalized_description text := trim(coalesce(p_description, ''));
  category_prefix text;
  issuance_number integer;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can issue honors'
      using errcode = '42501';
  end if;

  if length(normalized_title) = 0 or length(normalized_title) > 100
    or length(normalized_category) = 0 or length(normalized_category) > 60
    or length(normalized_description) = 0 or length(normalized_description) > 500 then
    raise exception 'Honor title, category, or description is invalid'
      using errcode = '22023';
  end if;

  select * into target_profile
  from public.profiles
  where id = p_clerk_id
    and role = 'clerk'
    and enabled = true;

  if not found then
    raise exception 'Honors can only be issued to enabled clerks'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.honor_ribbons where id = p_ribbon_id) then
    raise exception 'Honor ribbon was not found'
      using errcode = '22023';
  end if;

  category_prefix := case normalized_category
    when 'mainline' then 'ML'
    when 'event' then 'EV'
    when 'commission' then 'CM'
    when 'service' then 'LS'
    when 'investigation' then 'SI'
    else 'HR'
  end;

  -- Serialise one category at a time: revoked honors still count, so a number
  -- is never reused and simultaneous issuances cannot receive the same code.
  perform pg_advisory_xact_lock(hashtext('palis-honor:' || normalized_category));
  select count(*) + 1 into issuance_number
  from public.clerk_honors
  where category = normalized_category;

  insert into public.clerk_honors (
    clerk_id, ribbon_id, issued_by, code, title, category, description,
    issue_note, visibility, status
  ) values (
    target_profile.id, p_ribbon_id, auth.uid(),
    category_prefix || '-' || lpad(issuance_number::text, 3, '0'),
    normalized_title, normalized_category, normalized_description,
    '', 'public', 'active'
  ) returning * into saved_award;

  return saved_award;
end;
$$;

revoke all on function public.issue_clerk_honor(uuid, uuid, text, text, text) from public;
grant execute on function public.issue_clerk_honor(uuid, uuid, text, text, text) to authenticated;
