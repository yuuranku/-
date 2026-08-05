-- The PALIS assistant may expose names and registrations, but never account emails.
create or replace function public.list_public_clerk_directory()
returns table (
  id uuid,
  display_name text,
  clerk_rank smallint
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.clerk_rank
  from public.profiles p
  where p.role = 'clerk'
    and p.enabled = true
  order by p.created_at asc, p.display_name asc;
$$;

revoke all on function public.list_public_clerk_directory() from public;
grant execute on function public.list_public_clerk_directory() to anon, authenticated;
