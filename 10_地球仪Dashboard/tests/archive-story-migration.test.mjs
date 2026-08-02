import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202608020001_archive_story_pages.sql', import.meta.url);

test('archive story migration provides one public-readable table with owner/admin writes and admin notices', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /create table if not exists public\.archive_story_pages/i);
  assert.match(sql, /archive_id uuid not null references public\.archives/i);
  assert.match(sql, /char_length\(body\) between 1 and 4000/i);
  assert.match(sql, /char_length\(title\) between 1 and 60/i);
  assert.match(sql, /alter table public\.archive_story_pages enable row level security/i);
  assert.match(sql, /for select[\s\S]*using \(true\)/i);
  assert.match(sql, /role in \('observer', 'clerk', 'admin'\)/i);
  assert.match(sql, /author_id = auth\.uid\(\) or public\.is_admin\(\)/i);
  assert.match(sql, /after insert on public\.archive_story_pages/i);
  assert.match(sql, /insert into public\.archive_notifications/i);
  assert.match(sql, /profile\.role = 'admin'/i);
  assert.match(sql, /'announcement'/i);
});
