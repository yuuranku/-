-- Push mainline briefing, staffing and submitted personnel changes to every
-- open clerk/admin workspace.  RLS still decides which rows each session may
-- receive; this only enables delivery for tables already readable by policy.
do $$
begin
  alter publication supabase_realtime add table public.mainline_versions;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.mainline_staff_slots;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.archive_contributions;
exception when duplicate_object then null;
end $$;
