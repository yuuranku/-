import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('supplement attachments have a dedicated 1MB role and do not weaken image slots', async () => {
  const [workspace, repository, migration, repairMigration] = await Promise.all([
    read('./src/archive-workflow/workspace.js'),
    read('./src/archive-workflow/repositories/supabase-repository.js'),
    read('./supabase/migrations/202608050001_supplement_attachments.sql'),
    read('./supabase/migrations/202608060001_repair_supplement_attachment_role.sql'),
  ]);
  assert.match(workspace, /SUPPLEMENT_ATTACHMENT_MAX_BYTES\s*=\s*1024 \* 1024/);
  assert.match(workspace, /role:\s*'supplement'/);
  assert.match(workspace, /数据库附件规则尚未更新/);
  assert.match(repository, /role === 'supplement' \? 1024 \* 1024/);
  assert.match(migration, /if new\.role = 'supplement' then/);
  assert.match(migration, /new\.mime_type <> 'image\/webp'/);
  assert.match(migration, /set file_size_limit = 1048576/);
  assert.match(repairMigration, /if new\.role = 'supplement' then/);
  assert.match(repairMigration, /new\.role := coalesce/);
  assert.match(repairMigration, /set file_size_limit = 1048576/);
});

test('published archive windows expose attachment page, menu, and movable raw preview', async () => {
  const [index, main, stylesheet] = await Promise.all([
    read('./index.html'),
    read('./src/main.js'),
    read('./src/style.css'),
  ]);
  assert.match(index, /data-archive-menu-trigger="attachments"/);
  assert.match(main, /archive-attachment-page/);
  assert.match(main, /data-archive-attachment-open/);
  assert.match(main, /archive-attachment-window/);
  assert.match(main, /<iframe src=/);
  assert.match(stylesheet, /\.archive-attachment-window/);
  assert.match(stylesheet, /\.archive-attachment-content img/);
});
