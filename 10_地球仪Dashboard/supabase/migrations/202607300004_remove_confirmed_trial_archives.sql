-- Remove only the thirteen community test archives explicitly confirmed for deletion.
-- Relational records cascade from archives. Storage cleanup requires the
-- separate storage administrator, so it is deliberately not attempted here.

with targets(id) as (
  values
    ('61905a4e-916c-47d9-90b3-455e6e4ff70a'::uuid),
    ('a5574310-c4fb-4a31-9d2f-b4f7b0a6ddd4'::uuid),
    ('9324b538-a2f4-400b-87bc-fd02141a45ef'::uuid),
    ('b0725dc6-ef31-4fed-9af9-90bc0a5f41f3'::uuid),
    ('56de0191-baa6-45fe-a7d4-0f0d14b72a8a'::uuid),
    ('cb7994ef-af70-4900-b7e5-aee402dc3c29'::uuid),
    ('d8f30f33-614c-4b1e-aaa2-35a85f2482c7'::uuid),
    ('cf29357b-cf5a-492e-8c04-9d8e7535d5e9'::uuid),
    ('1391c94b-5385-46e5-93d6-9c3e0fdf12dc'::uuid),
    ('5908ac35-fe71-4f11-ae42-3bcaafb8e135'::uuid),
    ('39618919-9c8a-4911-8519-67b6fee0830b'::uuid),
    ('cf539f6f-cb0a-4455-b09d-d565898ce913'::uuid),
    ('28d9807a-631f-4336-9f8a-1b2fd3a22787'::uuid)
)
delete from public.archives archive
using targets
where archive.id = targets.id
  and archive.origin = 'community';
