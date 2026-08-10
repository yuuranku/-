-- Remove the retired O11 organisation record from every public directory
-- without cascading into existing submitted material.
update public.archives
set visibility = 'offline',
    is_archived = true,
    new_badge_visible = false
where code = 'O11'
   or business_code = 'O11';

notify pgrst, 'reload schema';
