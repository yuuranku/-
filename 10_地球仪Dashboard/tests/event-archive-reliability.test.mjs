import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { projectPublishedArchive } from '../src/archive-workflow/index-projector.js';
import { writeNativeFormDocument } from '../src/archive-workflow/native-form-profiles.js';
import { renderFormalArchiveDocument } from '../src/archive-workflow/public-renderer.js';
import { ARCHIVE_TEMPLATE_BY_CODE } from '../src/archive-workflow/templates.js';

const eventTemplate = ARCHIVE_TEMPLATE_BY_CODE['07'];
const eventReliabilityMigration = new URL('../supabase/migrations/202607300011_event_archive_reliability.sql', import.meta.url);

test('event repair migration preserves the publication function optional business-code argument', async () => {
  const sql = await readFile(eventReliabilityMigration, 'utf8');

  assert.match(
    sql,
    /p_contribution_id uuid, p_archive_id uuid, p_code text, p_category text, p_version text, p_marks jsonb, p_visibility text, p_business_code text default null\) returns jsonb/i,
  );
});

test('event native documents project the mission date and area into their archive index', () => {
  const document = writeNativeFormDocument(eventTemplate, {
    indexData: { title: '1964.12.10/ AU-W1 样本采集任务' },
    body: {
      missionDate: '1964年12月10日',
      missionArea: '威尔克斯湿门（AU-W1）',
    },
    optional: {},
    customEntries: [],
  });

  assert.equal(document.indexData.startDate, '1964-12-10');
  assert.equal(document.indexData.location, '威尔克斯湿门（AU-W1）');
  assert.equal(document.indexData.reviewStatus, '待审核');
});

test('event cover projection derives a date from legacy titles when its index date is absent', () => {
  const archive = projectPublishedArchive({
    id: 'event-legacy',
    code: 'EV33',
    category: 'event',
    sequence_number: 33,
    title: '1964.12.10/ AU-W1 样本采集任务',
    index_payload: { title: '1964.12.10/ AU-W1 样本采集任务' },
  });

  assert.equal(archive.year, '1964.12.10');
  assert.equal(archive.eventDate, '1964.12.10');
});

test('event mast does not repeat a date already embedded in a legacy event title', () => {
  const html = renderFormalArchiveDocument({
    archive: { code: 'EV33', category: 'event', sequence_number: 33, abbreviation: 'RLL' },
    contribution: { kind: 'new', owner: { display_name: '书记官' }, versions: [] },
    version: {
      version_label: '0.1',
      content: {
        schemaVersion: 2,
        templateCode: '07',
        category: 'event',
        abbreviation: 'RLL',
        title: '1964.12.10/ AU-W1 样本采集任务',
        values: {
          hero: '1964.12.10/ AU-W1 样本采集任务',
          missionDate: '1964年12月10日',
          missionArea: '威尔克斯湿门（AU-W1）',
        },
        sections: [],
        fieldLabels: {},
        references: [],
        media: [],
      },
      submitter: { display_name: '书记官' },
    },
  });

  assert.match(html, /1964\.12\.10\s*\/\s*AU-W1 样本采集任务/);
  assert.doesNotMatch(html, /1964\.12\.10\s*\/\s*1964\.12\.10/);
});
