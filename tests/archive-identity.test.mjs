import assert from 'node:assert/strict';
import test from 'node:test';

import { matchesArchiveIdentifier } from '../src/archive-workflow/archive-identity.js';

test('an original page code matches the business code of its renumbered server archive', () => {
  const archive = { code: 'N21', business_code: 'N09', title: '日本' };

  assert.equal(matchesArchiveIdentifier(archive, 'N09'), true);
  assert.equal(matchesArchiveIdentifier(archive, 'N21'), true);
  assert.equal(matchesArchiveIdentifier(archive, '日本'), true);
  assert.equal(matchesArchiveIdentifier(archive, 'N10'), false);
});
