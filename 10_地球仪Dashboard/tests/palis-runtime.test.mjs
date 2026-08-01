import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isLoopbackHostname,
  shouldEnableLocalAdmin,
} from '../src/runtime/palis-runtime-policy.js';

test('local administrator requires development, an explicit opt-in, and an exact loopback hostname', () => {
  const base = { dev: true, hostname: '127.0.0.1', explicit: true };

  assert.equal(shouldEnableLocalAdmin(base), true);
  assert.equal(shouldEnableLocalAdmin({ ...base, dev: false }), false);
  assert.equal(shouldEnableLocalAdmin({ ...base, explicit: false }), false);
  assert.equal(shouldEnableLocalAdmin({ ...base, hostname: 'preview.example' }), false);
});

test('loopback policy accepts only localhost and exact IPv4 or IPv6 loopback spellings', () => {
  for (const hostname of ['localhost', '127.0.0.1', '::1', '[::1]']) {
    assert.equal(isLoopbackHostname(hostname), true, hostname);
  }

  for (const hostname of [
    '',
    'preview.example',
    'localhost.example',
    '127.0.0.1.example',
    '0.0.0.0',
    '127.0.0.2',
  ]) {
    assert.equal(isLoopbackHostname(hostname), false, hostname);
  }
});
