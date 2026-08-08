begin;

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

commit;
