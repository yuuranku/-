import {
  createEditorDocument,
  normalizeEditorDocument,
} from './editor-document.js';

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
    }
  `;
  root.head?.append(style);
};

export const detectArchiveReferenceQuery = (value) => {
  const text = String(value ?? '');
  const match = text.match(/(?:^|[\s，。；：、])\/([^/\r\n]{0,40})$/);
  return match ? match[1].trim() : null;
};

export const replaceArchiveReferenceQuery = (value, reference) => {
  const text = String(value ?? '');
  const match = text.match(/(?:^|[\s，。；：、])\/([^/\r\n]{0,40})$/);
  if (!match) return text;
  const slashOffset = match.index + match[0].lastIndexOf('/');
  const code = String(reference?.code ?? '').trim();
  const label = String(reference?.label ?? reference?.title ?? '').trim();
  return `${text.slice(0, slashOffset)}〔${[code, label].filter(Boolean).join(' ')}〕`;
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
  root.querySelectorAll('[data-save]').forEach((element) => {
    const key = String(element?.dataset?.save ?? '').trim();
    if (key) values[key] = String(element.innerText ?? element.textContent ?? '');
  });
  const retainedMedia = Array.isArray(extras.media)
    ? extras.media.filter((entry) => entry?.field !== PHOTO_FIELD)
    : [];
  const structure = describeTemplateStructure(root);
  return createEditorDocument(template, values, {
    sections: structure.sections.length ? structure.sections : extras.sections,
    fieldLabels: {
      ...(extras.fieldLabels ?? {}),
      ...structure.fieldLabels,
    },
    indexData: extras.indexData,
    references: extras.references,
    media: [...retainedMedia, ...photoMedia(root)],
  });
};

export const writeTemplateDocument = (root, value) => {
  if (!root?.querySelectorAll) throw new TypeError('A template document is required');
  const document = normalizeEditorDocument(value);
  root.defaultView?.syncAmendmentItems?.(document.values);
  root.querySelectorAll('[data-save]').forEach((element) => {
    const key = String(element?.dataset?.save ?? '').trim();
    if (key) element.textContent = String(document.values[key] ?? '');
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
} = {}) => {
  if (!iframe?.addEventListener) throw new TypeError('A same-origin template iframe is required');
  let root = null;
  let current = normalizeEditorDocument(initialDocument ?? { templateCode: template?.code });
  let disposed = false;
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const removers = [];
  let observer = null;
  let activeReferenceElement = null;

  const emitChange = () => {
    if (!root || disposed) return;
    current = readTemplateDocument(root, template, current);
    onChange(structuredClone(current));
  };

  const setReadOnly = (readOnly) => {
    if (!root) return;
    root.querySelectorAll('[data-save]').forEach((element) => {
      const key = String(element?.dataset?.save ?? '').trim();
      const locked = readOnly || ARCHIVE_SYSTEM_FIELD_SET.has(key);
      element.setAttribute?.('contenteditable', locked ? 'false' : 'true');
      if (ARCHIVE_SYSTEM_FIELD_SET.has(key)) element.setAttribute?.('aria-readonly', 'true');
    });
    const input = root.querySelector?.('#photoInput');
    if (input) input.disabled = Boolean(readOnly);
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
    writeFieldValue(key, value) {
      if (!root) return false;
      const normalizedKey = String(key ?? '').trim();
      const element = [...root.querySelectorAll('[data-save]')]
        .find((candidate) => String(candidate?.dataset?.save ?? '').trim() === normalizedKey);
      return writeElementValue(element, value);
    },
    writeFieldByLabel(label, value) {
      if (!root) return false;
      const normalizedLabel = normalizeLabel(label);
      const element = [...root.querySelectorAll('[data-save]')].find((candidate) => {
        const candidateLabel = fieldLabel(candidate);
        return candidateLabel === normalizedLabel
          || candidateLabel.startsWith(normalizedLabel)
          || candidateLabel.includes(normalizedLabel);
      });
      return writeElementValue(element, value);
    },
    setSystemFields(fields) {
      return applySystemFields(fields);
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
      observer?.disconnect?.();
      removers.splice(0).forEach((remove) => remove());
    },
  };

  if (!waitForLoad && iframe.contentDocument?.readyState === 'complete') attach();
  return api;
};
