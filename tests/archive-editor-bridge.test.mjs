import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTemplateEditorBridge,
  detectArchiveReferenceQuery,
  readTemplateDocument,
  replaceArchiveReferenceQuery,
  writeTemplateDocument,
} from '../src/archive-workflow/editor-bridge.js';
import { createEditorDocument } from '../src/archive-workflow/editor-document.js';
import { ARCHIVE_TEMPLATE_BY_CODE } from '../src/archive-workflow/templates.js';

const createEditable = (key, text = '') => {
  const listeners = new Map();
  return {
    dataset: { save: key },
    textContent: text,
    addEventListener(type, listener) {
      const entries = listeners.get(type) || [];
      entries.push(listener);
      listeners.set(type, entries);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter((entry) => entry !== listener));
    },
    emit(type) {
      (listeners.get(type) || []).forEach((listener) => listener({ target: this }));
    },
  };
};

const createFixture = () => {
  const hero = createEditable('hero', '旧标题');
  const code = createEditable('entryCode', '');
  const unknown = createEditable('custom_unknown_key', '');
  const photoBox = {
    style: { backgroundImage: '' },
    classList: {
      contains: () => Boolean(photoBox.style.backgroundImage),
      add: () => {},
      remove: () => {},
    },
  };
  const root = {
    readyState: 'complete',
    querySelectorAll: (selector) => {
      if (selector === '[data-save]') return [hero, code, unknown];
      if (selector === '.sect') {
        return [{
          id: 'identity',
          querySelector: (nestedSelector) => nestedSelector === '.sect-label'
            ? { textContent: '身份资料 / IDENTITY' }
            : null,
          querySelectorAll: (nestedSelector) => nestedSelector === '[data-save]' ? [unknown] : [],
        }];
      }
      return [];
    },
    querySelector: (selector) => selector === '#photoBox' ? photoBox : null,
    defaultView: { saveForm: () => { throw new Error('template local save must be disabled'); } },
  };
  return { root, hero, code, unknown, photoBox };
};

test('template documents round-trip every data-save field and the photo slot', () => {
  const fixture = createFixture();
  const input = createEditorDocument(ARCHIVE_TEMPLATE_BY_CODE['06'], {
    hero: '叶夫根尼',
    entryCode: 'P-17',
    custom_unknown_key: '保留未知字段',
  }, {
    media: [{ field: 'photo', dataUrl: 'data:image/png;base64,AAAA' }],
  });

  writeTemplateDocument(fixture.root, input);
  const output = readTemplateDocument(fixture.root, ARCHIVE_TEMPLATE_BY_CODE['06']);

  assert.equal(fixture.hero.textContent, '叶夫根尼');
  assert.equal(output.values.entryCode, 'P-17');
  assert.equal(output.values.custom_unknown_key, '保留未知字段');
  assert.equal(output.media[0].dataUrl, 'data:image/png;base64,AAAA');
  assert.equal(output.sections[0].label, '身份资料 / IDENTITY');
  assert.deepEqual(output.sections[0].fields, ['custom_unknown_key']);
});

test('freeform amendment page restores every saved custom item before writing values', () => {
  const title = createEditable('amendment:title');
  const body = createEditable('amendment:body');
  const customItems = new Map();
  const root = {
    querySelectorAll(selector) {
      if (selector === '[data-save]') return [title, body, ...customItems.values()];
      if (selector === '.sect') return [];
      return [];
    },
    querySelector: () => null,
    defaultView: {
      syncAmendmentItems(values) {
        Object.keys(values)
          .filter((key) => key.startsWith('amendment:item:'))
          .forEach((key) => {
            if (!customItems.has(key)) customItems.set(key, createEditable(key));
          });
      },
    },
  };
  const input = createEditorDocument(ARCHIVE_TEMPLATE_BY_CODE['03'], {
    'amendment:title': '补充记录',
    'amendment:body': '新增观测内容',
    'amendment:item:field-1:label': '新坐标',
    'amendment:item:field-1:value': '78°S / 164°E',
  });

  writeTemplateDocument(root, input);

  assert.equal(customItems.get('amendment:item:field-1:label').textContent, '新坐标');
  assert.equal(customItems.get('amendment:item:field-1:value').textContent, '78°S / 164°E');
});

test('the iframe bridge turns template input into editor document changes', async () => {
  const fixture = createFixture();
  const changes = [];
  const iframeListeners = new Map();
  const iframe = {
    contentDocument: fixture.root,
    contentWindow: fixture.root.defaultView,
    addEventListener(type, listener) {
      iframeListeners.set(type, listener);
    },
    removeEventListener(type) {
      iframeListeners.delete(type);
    },
  };
  const bridge = createTemplateEditorBridge({
    iframe,
    template: ARCHIVE_TEMPLATE_BY_CODE['07'],
    initialDocument: createEditorDocument(ARCHIVE_TEMPLATE_BY_CODE['07'], {
      hero: 'HZ-6 初始稿',
      entryCode: 'HZ-6',
    }),
    onChange: (document) => changes.push(document),
  });

  await bridge.ready;
  fixture.hero.textContent = 'HZ-6 修订稿';
  fixture.hero.emit('input');

  assert.equal(changes.at(-1).title, 'HZ-6 修订稿');
  assert.equal(changes.at(-1).businessCode, 'HZ-6');
  assert.equal(fixture.root.defaultView.saveForm(), undefined);
  bridge.dispose();
});

test('slash reference helpers find the current query and replace only its token', () => {
  assert.equal(detectArchiveReferenceQuery('事件涉及 /文'), '文');
  assert.equal(detectArchiveReferenceQuery('事件涉及 /'), '');
  assert.equal(detectArchiveReferenceQuery('普通正文'), null);
  assert.equal(
    replaceArchiveReferenceQuery('事件涉及 /文', { code: 'P32', label: '文森特' }),
    '事件涉及 〔P32 文森特〕',
  );
});
