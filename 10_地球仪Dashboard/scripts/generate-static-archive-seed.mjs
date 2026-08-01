import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { buildOfficialWorkspaceBaselines } from '../src/archive-workflow/official-archive-baseline.js';

const outputPath = resolve('supabase/migrations/202607300008_seed_all_static_archive_bases.sql');
const sqlLiteral = (value) => `'${String(value ?? '').replaceAll("'", "''")}'`;
const jsonLiteral = (value) => `${sqlLiteral(JSON.stringify(value ?? {}))}::jsonb`;
const timestampLiteral = (value) => `${sqlLiteral(value)}::timestamptz`;

export const buildStaticArchiveSeedSql = (archives = buildOfficialWorkspaceBaselines()) => {
  const rows = [...archives]
    .sort((left, right) => String(left.code).localeCompare(String(right.code)))
    .map((archive) => `  (${[
      sqlLiteral(archive.code),
      sqlLiteral(archive.business_code),
      sqlLiteral(archive.category),
      sqlLiteral(archive.title),
      sqlLiteral(archive.summary),
      sqlLiteral(archive.visibility),
      sqlLiteral(archive.origin),
      archive.is_mother ? 'true' : 'false',
      archive.is_archived ? 'true' : 'false',
      Number(archive.sequence_number) || 1,
      sqlLiteral(archive.abbreviation),
      jsonLiteral(archive.index_payload),
      archive.new_badge_visible ? 'true' : 'false',
      timestampLiteral(archive.published_at),
    ].join(', ')})`)
    .join(',\n');

  return `-- Generated from src/archive-data.js. Do not edit by hand.\n-- Each row is an immutable source record for the existing public archive UI.\nwith official_static_archives (\n  code, business_code, category, title, summary, visibility, origin,\n  is_mother, is_archived, sequence_number, abbreviation, index_payload,\n  new_badge_visible, published_at\n) as (\nvalues\n${rows}\n)\ninsert into public.archives (\n  code, business_code, category, title, summary, visibility, origin,\n  is_mother, is_archived, sequence_number, abbreviation, index_payload,\n  new_badge_visible, published_at\n)\nselect\n  code, business_code, category, title, summary, visibility, origin,\n  is_mother, is_archived,\n  case when exists (\n    select 1\n    from public.archives sequence_conflict\n    where sequence_conflict.category = source.category\n      and sequence_conflict.sequence_number = source.sequence_number\n  ) then null else sequence_number end,\n  abbreviation, index_payload,\n  new_badge_visible, published_at\nfrom official_static_archives source\nwhere not exists (\n  select 1\n  from public.archives archive\n  where archive.code = source.code\n     or archive.business_code = source.business_code\n)\non conflict (code) do nothing;\n\nnotify pgrst, 'reload schema';\n`;
};

const sql = buildStaticArchiveSeedSql();
if (process.argv.includes('--stdout')) {
  process.stdout.write(sql);
} else {
  await writeFile(outputPath, sql, 'utf8');
  process.stdout.write(`Wrote ${outputPath}\n`);
}
