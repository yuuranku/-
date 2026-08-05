-- Each specimen points to one ecological layer.  The value lives on the
-- species archive so the ecology console and the archive editor share one
-- source of truth. Existing curator choices are never overwritten.
with species_ecology (business_code, ecology_code) as (
  values
    ('S01', 'E04'), ('S02', 'E01'), ('S03', 'E02'), ('S04', 'E06'),
    ('S05', 'E06'), ('S06', 'E03'), ('S07', 'E02'), ('S08', 'E05'),
    ('S09', 'E03'), ('S10', 'E04'), ('S11', 'E07'), ('S12', 'E05'),
    ('S13', 'E03'), ('S14', 'E04'), ('S15', 'E01'), ('S16', 'E06'),
    ('S17', 'E05'), ('S18', 'E07'), ('S19', 'E07'), ('S20', 'E06'),
    ('S21', 'E04'), ('S22', 'E01')
)
update public.archives as archive
set index_payload = coalesce(archive.index_payload, '{}'::jsonb)
  || jsonb_build_object('ecologyCode', source.ecology_code)
from species_ecology as source
where archive.category = 'species'
  and coalesce(nullif(archive.business_code, ''), archive.code) = source.business_code
  and coalesce(nullif(archive.index_payload ->> 'ecologyCode', ''), '') = '';

notify pgrst, 'reload schema';
