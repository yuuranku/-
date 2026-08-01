import assert from 'node:assert/strict';
import test from 'node:test';

import {
  durableArchiveMedia,
  mediaPolicyForCategory,
  normalizeArchiveMedia,
  optimizeArchiveImage,
} from '../src/archive-workflow/media.js';

const namedBlob = (bytes, type, name = 'source.png') => {
  const blob = new Blob([new Uint8Array(bytes)], { type });
  Object.defineProperty(blob, 'name', { value: name });
  Object.defineProperty(blob, 'lastModified', { value: 1 });
  return blob;
};

test('all nine archive categories expose one bounded primary image slot in their native record position', () => {
  assert.equal(mediaPolicyForCategory('person').maxSourceBytes, 5 * 1024 * 1024);
  assert.deepEqual(
    mediaPolicyForCategory('person').slots.map(({ role, field, limit }) => ({
      role,
      field,
      limit,
    })),
    [{ role: 'portrait', field: 'photo', limit: 1 }],
  );
  assert.deepEqual(
    mediaPolicyForCategory('event').slots.map(({ role, field, limit }) => ({
      role,
      field,
      limit,
    })),
    [
      { role: 'event-cover', field: 'photo', limit: 1 },
      { role: 'event-evidence', field: 'evidence', limit: 6 },
    ],
  );
  assert.deepEqual(
    mediaPolicyForCategory('anomaly').slots.map(({ role, field, limit }) => ({
      role,
      field,
      limit,
    })),
    [
      { role: 'anomaly-cover', field: 'photo', limit: 1 },
      { role: 'anomaly-image', field: 'evidence', limit: 6 },
    ],
  );
  assert.deepEqual(
    mediaPolicyForCategory('species').slots.map(({ role, field, limit }) => ({
      role,
      field,
      limit,
    })),
    [
      { role: 'species-cover', field: 'photo', limit: 1 },
      { role: 'species-image', field: 'evidence', limit: 6 },
    ],
  );
  for (const [category, role] of [
    ['country', 'country-flag'],
    ['organization', 'organization-cover'],
    ['station', 'station-cover'],
    ['entrance', 'entrance-cover'],
    ['ecology', 'ecology-cover'],
  ]) {
    assert.deepEqual(
      mediaPolicyForCategory(category).slots.map(({ role: actualRole, field, limit }) => ({
        role: actualRole,
        field,
        limit,
      })),
      [{ role, field: 'photo', limit: 1 }],
    );
  }
});

test('media normalization keeps durable identity and transient display URLs without leaking file objects', () => {
  const inputFile = namedBlob(8, 'image/png');
  const normalized = normalizeArchiveMedia([
    {
      id: 'attachment-2',
      role: 'event-evidence',
      storage_path: 'private/event/evidence.webp',
      publicUrl: 'blob:evidence',
      alt_text: '雪面上的器材',
      caption: '证据图二',
      sort_order: 2,
      file: inputFile,
    },
    {
      attachmentId: 'attachment-1',
      role: 'event-cover',
      field: 'photo',
      storagePath: 'private/event/cover.webp',
      publicUrl: 'https://example.test/signed-cover',
      altText: '事件封面',
      caption: '主封面',
      sortOrder: 0,
    },
  ]);

  assert.deepEqual(normalized, [
    {
      attachmentId: 'attachment-1',
      field: 'photo',
      role: 'event-cover',
      storagePath: 'private/event/cover.webp',
      publicUrl: 'https://example.test/signed-cover',
      dataUrl: '',
      altText: '事件封面',
      caption: '主封面',
      sortOrder: 0,
    },
    {
      attachmentId: 'attachment-2',
      field: 'evidence',
      role: 'event-evidence',
      storagePath: 'private/event/evidence.webp',
      publicUrl: 'blob:evidence',
      dataUrl: '',
      altText: '雪面上的器材',
      caption: '证据图二',
      sortOrder: 2,
    },
  ]);
  assert.equal(Object.hasOwn(normalized[1], 'file'), false);
});

test('durable media serialization never persists signed, blob, or data URLs', () => {
  const durable = durableArchiveMedia([
    {
      attachmentId: 'attachment-1',
      role: 'portrait',
      storagePath: 'private/person/portrait.webp',
      publicUrl: 'https://example.test/temporary-signature',
      dataUrl: 'data:image/webp;base64,AAAA',
      altText: '人物头像',
      caption: '登记照',
    },
    {
      role: 'event-cover',
      publicUrl: 'blob:local-preview-only',
    },
  ]);

  assert.deepEqual(durable, [{
    attachmentId: 'attachment-1',
    field: 'photo',
    role: 'portrait',
    storagePath: 'private/person/portrait.webp',
    altText: '人物头像',
    caption: '登记照',
    sortOrder: 0,
  }]);
  assert.equal(JSON.stringify(durable).includes('temporary-signature'), false);
  assert.equal(JSON.stringify(durable).includes('blob:'), false);
  assert.equal(JSON.stringify(durable).includes('data:image'), false);
});

test('image optimization rejects invalid inputs before allocating a canvas', async () => {
  await assert.rejects(
    optimizeArchiveImage(namedBlob(100, 'application/pdf', 'record.pdf')),
    (error) => error?.code === 'invalid_media_type',
  );
  await assert.rejects(
    optimizeArchiveImage(namedBlob(6 * 1024 * 1024, 'image/png')),
    (error) => error?.code === 'media_source_too_large',
  );
});

test('image optimization scales to 1600px and lowers WebP quality until it is under 800KB', async () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  const originalOffscreenCanvas = globalThis.OffscreenCanvas;
  const calls = [];
  let closed = false;
  class FakeCanvas {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }

    getContext() {
      return { drawImage: () => {} };
    }

    async convertToBlob({ type, quality }) {
      calls.push({ type, quality, width: this.width, height: this.height });
      const size = quality > 0.75 ? 900 * 1024 : 700 * 1024;
      return new Blob([new Uint8Array(size)], { type });
    }
  }
  globalThis.createImageBitmap = async () => ({
    width: 2400,
    height: 1200,
    close: () => { closed = true; },
  });
  globalThis.OffscreenCanvas = FakeCanvas;

  try {
    const optimized = await optimizeArchiveImage(namedBlob(2 * 1024 * 1024, 'image/png'));
    assert.equal(optimized.type, 'image/webp');
    assert.ok(optimized.size <= 800 * 1024);
    assert.match(optimized.name, /\.webp$/);
    assert.deepEqual(
      calls.map(({ width, height }) => [width, height]),
      [[1600, 800], [1600, 800]],
    );
    assert.deepEqual(calls.map(({ quality }) => quality), [0.82, 0.75]);
    assert.equal(closed, true);
  } finally {
    globalThis.createImageBitmap = originalCreateImageBitmap;
    globalThis.OffscreenCanvas = originalOffscreenCanvas;
  }
});
