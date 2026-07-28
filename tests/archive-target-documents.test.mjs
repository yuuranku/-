import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildArchiveDocumentChoices,
  resolveArchiveDocumentTarget,
} from '../src/archive-workflow/target-documents.js';

test('an official archive offers its website record before independent submitted documents', () => {
  const choices = buildArchiveDocumentChoices({
    archive: { id: 'station-1', origin: 'official', title: '科考站' },
    documents: [{
      id: 'document-1',
      title: '冬季观测记录',
      latestVersionId: 'version-3',
      versionLabel: '0.3',
      ownerName: '书记官甲',
    }],
  });

  assert.deepEqual(choices, [
    {
      value: 'official:station-1',
      label: '官方档案正文',
      targetContributionId: null,
      baseVersionId: null,
      official: true,
    },
    {
      value: 'document-1',
      label: '冬季观测记录 / VER 0.3 / 书记官甲',
      targetContributionId: 'document-1',
      baseVersionId: 'version-3',
      official: false,
    },
  ]);
});

test('a selected independent document resolves the exact target and immutable base version', () => {
  const choices = buildArchiveDocumentChoices({
    archive: { id: 'event-1', origin: 'community' },
    documents: [{
      id: 'document-7',
      title: '第一次现场记录',
      latestVersionId: 'version-9',
      versionLabel: '0.2',
      ownerName: '书记官乙',
    }],
  });

  assert.deepEqual(resolveArchiveDocumentTarget(choices, 'document-7'), {
    value: 'document-7',
    label: '第一次现场记录 / VER 0.2 / 书记官乙',
    targetContributionId: 'document-7',
    baseVersionId: 'version-9',
    official: false,
  });
  assert.equal(resolveArchiveDocumentTarget(choices, ''), null);
});
