alter table public.profiles
  add column if not exists clerk_rank smallint not null default 1;

alter table public.profiles
  drop constraint if exists profiles_clerk_rank_range;

alter table public.profiles
  add constraint profiles_clerk_rank_range check (clerk_rank between 1 and 7);

update public.profiles
set clerk_rank = 1
where clerk_rank is null or clerk_rank < 1 or clerk_rank > 7;
