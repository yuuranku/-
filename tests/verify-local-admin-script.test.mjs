import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXPECTED_LOCAL_ADMIN_NUMBERING,
  isAllowedVerificationRequest,
  isViewportRectVisible,
  summarizeVerification,
} from '../scripts/verify-local-admin.mjs';

test('local verification rejects every request outside its loopback origin', () => {
  const origin = 'http://127.0.0.1:4173';

  assert.equal(isAllowedVerificationRequest(`${origin}/src/main.js`, origin), true);
  assert.equal(isAllowedVerificationRequest('data:image/png;base64,AA==', origin), true);
  assert.equal(isAllowedVerificationRequest('blob:http://127.0.0.1:4173/id', origin), true);
  assert.equal(
    isAllowedVerificationRequest(
      'https://hpzdccfrouhljqlzczuv.supabase.co/rest/v1/archives',
      origin,
    ),
    false,
  );
  assert.equal(isAllowedVerificationRequest('http://127.0.0.1:4174/other', origin), false);
  assert.equal(isAllowedVerificationRequest('https://example.com/font.woff2', origin), false);
});

test('local verification uses the hand-checked next number for all nine categories', () => {
  assert.deepEqual(EXPECTED_LOCAL_ADMIN_NUMBERING, {
    country: { code: 'N19', formalNumber: '019.REG' },
    organization: { code: 'O25', formalNumber: '025.CHN' },
    station: { code: 'ST21', formalNumber: '021.LOG' },
    entrance: { code: 'EN19', formalNumber: '019.CRD' },
    ecology: { code: 'E08', formalNumber: '008.ECO' },
    person: { code: 'P47', formalNumber: '047.PER' },
    event: { code: 'EV27', formalNumber: '027.RLL' },
    anomaly: { code: 'A26', formalNumber: '026.TRC' },
    species: { code: 'S23', formalNumber: '023.SPC' },
  });
});

test('verification summary fails on a false assertion or an external request', () => {
  assert.equal(summarizeVerification({
    assertions: [{ id: 'one', passed: true }],
    externalRequests: [],
    diagnostics: [],
  }).passed, true);

  assert.equal(summarizeVerification({
    assertions: [{ id: 'one', passed: false }],
    externalRequests: [],
    diagnostics: [],
  }).passed, false);

  assert.equal(summarizeVerification({
    assertions: [{ id: 'one', passed: true }],
    externalRequests: [{ url: 'https://example.com' }],
    diagnostics: [],
  }).passed, false);

  assert.equal(summarizeVerification({
    assertions: [{ id: 'one', passed: true }],
    externalRequests: [],
    diagnostics: [{ level: 'pageerror', message: 'boom' }],
  }).passed, false);
});

test('screenshot evidence is accepted only when its target intersects the viewport', () => {
  assert.equal(isViewportRectVisible({
    top: 120,
    right: 1200,
    bottom: 780,
    left: 40,
  }, { width: 1440, height: 900 }), true);
  assert.equal(isViewportRectVisible({
    top: 920,
    right: 1200,
    bottom: 1700,
    left: 40,
  }, { width: 1440, height: 900 }), false);
  assert.equal(isViewportRectVisible({
    top: 100,
    right: -10,
    bottom: 700,
    left: -800,
  }, { width: 1440, height: 900 }), false);
});
