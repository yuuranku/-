import {
  createEditorDocument,
  normalizeEditorDocument,
} from './editor-document.js';
import { createEditorEmbedLayout } from './editor-embed-layout.js';
import { extractInlineText, renderInlineText } from './inline-text-format.js';

const PHOTO_FIELD = 'photo';
export const ARCHIVE_SYSTEM_FIELD_KEYS = Object.freeze([
  'dossierNo',
  'entryCode',
  'regDate',
  'clerk',
]);
const ARCHIVE_SYSTEM_FIELD_SET = new Set(ARCHIVE_SYSTEM_FIELD_KEYS);
const SYSTEM_FIELD_PLACEHOLDER = '审核录入时自动生成';

const extractBackgroundUrl = (value) => {
  const background = String(value ?? '').trim();
  if (!background || background === 'none') return '';
  const match = background.match(/^url\((?:"|')?(.*?)(?:"|')?\)$/i);
  return match ? match[1] : '';
};

const photoMedia = (root) => {
  const photoBox = root?.querySelector?.('#photoBox');
  const dataUrl = extractBackgroundUrl(photoBox?.style?.backgroundImage);
  return dataUrl ? [{ field: PHOTO_FIELD, dataUrl }] : [];
};

const normalizeLabel = (value) => String(value ?? '').replaceAll(/\s+/g, ' ').trim();

const installEditorPerformanceStyles = (root) => {
  if (!root?.getElementById || !root?.createElement || !root?.head) return;
  const legacyPhotoInput = root.getElementById('photoInput');
  legacyPhotoInput?.setAttribute?.('disabled', '');
  const legacyPhotoBox = root.getElementById('photoBox');
  legacyPhotoBox?.removeAttribute?.('for');
  legacyPhotoBox?.setAttribute?.('aria-disabled', 'true');
  const legacyPhotoPrompt = legacyPhotoBox?.querySelector?.('.cap b');
  if (legacyPhotoPrompt) legacyPhotoPrompt.textContent = '由工作台添加';
  if (root.getElementById('palis-editor-performance-styles')) return;
  const style = root.createElement('style');
  style.id = 'palis-editor-performance-styles';
  style.textContent = `
    @media screen {
      .page:not(:first-child) { content-visibility: auto; contain-intrinsic-size: 210mm 297mm; }
      [data-system-field]:empty::before {
        content: attr(data-system-placeholder);
        color: #868b88;
        font-style: normal;
        opacity: .76;
      }
      #photoBox[aria-disabled='true'] { cursor: default !important; }
    }
  `;
  root.head?.append(style);
};

const currentArchiveReferenceToken = (value, caret = String(value ?? '').length) => {
  const text = String(value ?? '');
  const cursor = Math.max(0, Math.min(text.length, Number(caret) || 0));
  const slashOffset = text.lastIndexOf('/', Math.max(0, cursor - 1));
  if (slashOffset < 0) return null;
  const query = text.slice(slashOffset + 1, cursor);
  if (query.length > 40 || /[/\r\n]/.test(query)) return null;
  // A slash inside a URL is ordinary prose, not an archive-reference command.
  if (/(?:https?|ftp):\/\/\S*$/i.test(text.slice(0, cursor))) return null;
  return { query: query.trim(), slashOffset, caret: cursor };
};

export const detectArchiveReferenceQuery = (value, caret) => {
  return currentArchiveReferenceToken(value, caret)?.query ?? null;
};

export const replaceArchiveReferenceQuery = (value, reference, caret) => {
  const text = String(value ?? '');
  const token = currentArchiveReferenceToken(text, caret);
  if (!token) return text;
  const code = String(reference?.code ?? '').trim();
  const label = String(reference?.label ?? reference?.title ?? '').trim();
  return `${text.slice(0, token.slashOffset)}〔${[code, label].filter(Boolean).join(' ')}〕${text.slice(token.caret)}`;
};

const describeTemplateStructure = (root) => {
  const fieldLabels = {};
  root.querySelectorAll('[data-save]').forEach((element) => {
    const key = String(element?.dataset?.save ?? '').trim();
    if (!key) return;
    const container = element.closest?.(
      '.f, .fieldbox, .block, .titlecard-foot, .titlecard-tag, .pr, .bigyear',
    );
    const label = normalizeLabel(
      container?.querySelector?.('dt, .blabel, label, b, em')?.textContent,
    );
    if (label) fieldLabels[key] = label;
  });
  const sections = [...root.querySelectorAll('.sect')].map((section, index) => ({
    id: String(section.id || `section-${index + 1}`),
    label: normalizeLabel(section.querySelector?.('.sect-label')?.textContent)
      || `档案分区 ${String(index + 1).padStart(2, '0')}`,
    fields: [...section.querySelectorAll('[data-save]')]
      .map((element) => String(element?.dataset?.save ?? '').trim())
      .filter(Boolean),
  })).filter((section) => section.fields.length);
  return { sections, fieldLabels };
};

const fieldLabel = (element) => {
  const container = element.closest?.(
    '.f, .fieldbox, .block, .titlecard-foot, .titlecard-tag, .pr, .bigyear',
  );
  return normalizeLabel(
    container?.querySelector?.('dt, .blabel, label, b, em')?.textContent,
  );
};

export const readTemplateDocument = (root, template, extras = {}) => {
  if (!root?.querySelectorAll) throw new TypeError('A template document is required');
  const values = {};
  const inlineMarks = {};
  root.querySelectorAll('[data-save]').forEach((element) => {
    const key = String(element?.dataset?.save ?? '').trim();
    if (!key) return;
    const extracted = extractInlineText(element);
    values[key] = extracted.text;
    if (extracted.marks.length) inlineMarks[key] = extracted.marks;
  });
  const retainedMedia = Array.isArray(extras.media)
    ? extras.media.filter((entry) =>
      entry?.field !== PHOTO_FIELD || entry?.attachmentId || entry?.storagePath)
    : [];
  const hasDurablePhoto = retainedMedia.some((entry) =>
    entry?.field === PHOTO_FIELD && (entry?.attachmentId || entry?.storagePath));
  const structure = describeTemplateStructure(root);
  return createEditorDocument(template, values, {
    sections: structure.sections.length ? structure.sections : extras.sections,
    fieldLabels: {
      ...(extras.fieldLabels ?? {}),
      ...structure.fieldLabels,
    },
    indexData: extras.indexData,
    references: extras.references,
    inlineMarks: { ...(extras.inlineMarks ?? {}), ...inlineMarks },
    media: [...retainedMedia, ...(hasDurablePhoto ? [] : photoMedia(root))],
  });
};

export const writeTemplateDocument = (root, value) => {
  if (!root?.querySelectorAll) throw new TypeError('A template document is required');
  const document = normalizeEditorDocument(value);
  root.defaultView?.syncAmendmentItems?.(document.values);
  root.querySelectorAll('[data-save]').forEach((element) => {
    const key = String(element?.dataset?.save ?? '').trim();
    if (key) {
      const valueText = String(document.values[key] ?? '');
      element.innerHTML = renderInlineText(valueText, document.inlineMarks?.[key] || []);
      // Lightweight test doubles and a few legacy wrappers expose only
      // textContent; keep them in sync while real DOM nodes use the markup.
      if (!element.childNodes && 'textContent' in element) element.textContent = valueText;
    }
  });

  const photoBox = root.querySelector?.('#photoBox');
  const photo = document.media.find((entry) => entry?.field === PHOTO_FIELD);
  if (photoBox) {
    const source = String(photo?.dataUrl ?? photo?.publicUrl ?? '').trim();
    photoBox.style.backgroundImage = source ? `url("${source}")` : '';
    if (source) photoBox.classList?.add?.('has-photo');
    else photoBox.classList?.remove?.('has-photo');
  }
  root.defaultView?.updateHero?.();
  root.defaultView?.syncMirrors?.();
  return document;
};

export const createTemplateEditorBridge = ({
  iframe,
  template,
  initialDocument,
  onChange = () => {},
  onReferenceTrigger = () => {},
  waitForLoad = false,
  embedded = false,
  onHeightChange = () => {},
  onOutlineChange = () => {},
  onLayoutError = () => {},
} = {}) => {
  if (!iframe?.addEventListener) throw new TypeError('A same-origin template iframe is required');
  let root = null;
  let current = normalizeEditorDocument(initialDocument ?? { templateCode: template?.code });
  let disposed = false;
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const removers = [];
  let observer = null;
  let embedLayout = null;
  let activeReferenceElement = null;
  const synchronizedElements = new Set();
  let bridgeReadOnly = false;

  const emitChange = () => {
    if (!root || disposed) return;
    current = readTemplateDocument(root, template, current);
    onChange(structuredClone(current));
  };

  const setReadOnly = (readOnly) => {
    bridgeReadOnly = Boolean(readOnly);
    if (!root) return;
    root.querySelectorAll('[data-save]').forEach((element) => {
      const key = String(element?.dataset?.save ?? '').trim();
      const locked = bridgeReadOnly
        || ARCHIVE_SYSTEM_FIELD_SET.has(key)
        || synchronizedElements.has(element);
      element.setAttribute?.('contenteditable', locked ? 'false' : 'true');
      element.setAttribute?.('aria-readonly', String(locked));
    });
    const input = root.querySelector?.('#photoInput');
    if (input) input.disabled = bridgeReadOnly;
  };

  const elementForDescriptor = (descriptor = {}) => {
    if (descriptor.key) {
      return [...root.querySelectorAll('[data-save]')].find((candidate) =>
        String(candidate.dataset?.save ?? '').trim() === descriptor.key);
    }
    const label = normalizeLabel(descriptor.label);
    return [...root.querySelectorAll('[data-save]')].find((candidate) => {
      const candidateLabel = fieldLabel(candidate);
      return candidateLabel === label
        || candidateLabel.startsWith(label)
        || candidateLabel.includes(label);
    });
  };

  const setSynchronizedFields = (descriptors = []) => {
    if (!root) return 0;
    synchronizedElements.forEach((element) => {
      delete element.dataset.indexSynchronized;
      delete element.dataset.indexSynchronizedLabel;
    });
    synchronizedElements.clear();
    descriptors.forEach((descriptor) => {
      const element = elementForDescriptor(descriptor);
      if (!element) return;
      synchronizedElements.add(element);
      element.dataset.indexSynchronized = 'true';
      element.dataset.indexSynchronizedLabel = '由目录索引同步';
      element.setAttribute('contenteditable', 'false');
      element.setAttribute('aria-readonly', 'true');
    });
    setReadOnly(bridgeReadOnly);
    return synchronizedElements.size;
  };

  const writeElementValue = (element, value, { notify = true } = {}) => {
    if (!element) return false;
    const key = String(element?.dataset?.save ?? '').trim();
    element.textContent = String(value ?? '');
    if (key) {
      current.values = {
        ...current.values,
        [key]: String(value ?? ''),
      };
    }
    root?.defaultView?.updateHero?.();
    root?.defaultView?.syncMirrors?.();
    if (notify) emitChange();
    return true;
  };

  const applySystemFields = (fields = {}, { notify = true } = {}) => {
    if (!root) return false;
    let changed = false;
    root.querySelectorAll('[data-save]').forEach((element) => {
      const key = String(element?.dataset?.save ?? '').trim();
      if (!ARCHIVE_SYSTEM_FIELD_SET.has(key)) return;
      element.dataset.systemField = key;
      element.dataset.systemPlaceholder = SYSTEM_FIELD_PLACEHOLDER;
      element.setAttribute?.('data-ph', SYSTEM_FIELD_PLACEHOLDER);
      element.setAttribute?.('contenteditable', 'false');
      element.setAttribute?.('aria-readonly', 'true');
      const nextValue = String(fields[key] ?? current.values?.[key] ?? '');
      if (String(element.textContent ?? '') !== nextValue) {
        element.textContent = nextValue;
        changed = true;
      }
      current.values = {
        ...current.values,
        [key]: nextValue,
      };
    });
    root.defaultView?.syncMirrors?.();
    if (notify && changed) emitChange();
    return true;
  };

  const attach = () => {
    if (disposed) return;
    root = iframe.contentDocument;
    if (!root?.querySelectorAll) {
      resolveReady(null);
      return;
    }
    if (iframe.contentWindow && 'saveForm' in iframe.contentWindow) {
      iframe.contentWindow.saveForm = () => {};
    }
    installEditorPerformanceStyles(root);
    writeTemplateDocument(root, current);
    applySystemFields(current.values, { notify: false });
    if (embedded) {
      try {
        embedLayout = createEditorEmbedLayout({
          root,
          onHeightChange,
          onOutlineChange,
          onError: onLayoutError,
        });
      } catch (error) {
        onLayoutError(error);
      }
    }
    const handleEditorInput = (element) => {
      emitChange();
      const query = detectArchiveReferenceQuery(element?.innerText ?? element?.textContent);
      if (query === null) return;
      activeReferenceElement = element;
      onReferenceTrigger({
        query,
        key: String(element.dataset?.save ?? ''),
      });
    };
    if (root.addEventListener) {
      const onInput = (event) => {
        const element = event.target?.closest?.('[data-save]')
          || (event.target?.dataset?.save ? event.target : null);
        if (element) handleEditorInput(element);
        else emitChange();
      };
      root.addEventListener('input', onInput);
      removers.push(() => root.removeEventListener?.('input', onInput));
    } else {
      root.querySelectorAll('[data-save]').forEach((element) => {
        const onInput = () => handleEditorInput(element);
        element.addEventListener?.('input', onInput);
        removers.push(() => element.removeEventListener?.('input', onInput));
      });
    }
    const photoInput = root.querySelector?.('#photoInput');
    if (photoInput) {
      photoInput.addEventListener('change', emitChange);
      removers.push(() => photoInput.removeEventListener('change', emitChange));
    }
    const Observer = root.defaultView?.MutationObserver;
    const photoBox = root.querySelector?.('#photoBox');
    if (Observer && photoBox) {
      observer = new Observer(emitChange);
      observer.observe(photoBox, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    resolveReady(api);
  };

  const onLoad = () => attach();
  iframe.addEventListener('load', onLoad);
  removers.push(() => iframe.removeEventListener('load', onLoad));

  const api = {
    ready,
    read() {
      if (root) current = readTemplateDocument(root, template, current);
      return structuredClone(current);
    },
    write(value) {
      current = normalizeEditorDocument(value);
      if (root) {
        writeTemplateDocument(root, current);
        applySystemFields(current.values, { notify: false });
      }
      return structuredClone(current);
    },
    writeFieldValue(key, value, options = {}) {
      if (!root) return false;
      const normalizedKey = String(key ?? '').trim();
      const element = [...root.querySelectorAll('[data-save]')]
        .find((candidate) => String(candidate?.dataset?.save ?? '').trim() === normalizedKey);
      return writeElementValue(element, value, options);
    },
    writeFieldByLabel(label, value, options = {}) {
      if (!root) return false;
      const normalizedLabel = normalizeLabel(label);
      const element = [...root.querySelectorAll('[data-save]')].find((candidate) => {
        const candidateLabel = fieldLabel(candidate);
        return candidateLabel === normalizedLabel
          || candidateLabel.startsWith(normalizedLabel)
          || candidateLabel.includes(normalizedLabel);
      });
      return writeElementValue(element, value, options);
    },
    setSystemFields(fields) {
      return applySystemFields(fields);
    },
    setSynchronizedFields,
    getSectionOutline() {
      return embedLayout?.getSectionOutline() ?? [];
    },
    measureEmbeddedHeight() {
      return embedLayout?.measure() ?? 0;
    },
    insertReference(reference) {
      if (!root || !activeReferenceElement) return false;
      const currentText = String(
        activeReferenceElement.innerText ?? activeReferenceElement.textContent ?? '',
      );
      const nextText = replaceArchiveReferenceQuery(currentText, reference);
      if (nextText === currentText) return false;
      activeReferenceElement.textContent = nextText;
      const selection = root.defaultView?.getSelection?.();
      const range = root.createRange?.();
      if (selection && range) {
        range.selectNodeContents(activeReferenceElement);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      emitChange();
      activeReferenceElement = null;
      return true;
    },
    setReadOnly,
    dispose() {
      if (disposed) return;
      disposed = true;
      embedLayout?.dispose();
      observer?.disconnect?.();
      removers.splice(0).forEach((remove) => remove());
    },
  };

  if (!waitForLoad && iframe.contentDocument?.readyState === 'complete') attach();
  return api;
};
