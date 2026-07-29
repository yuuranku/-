import { createEditorDocument } from './editor-document.js';

const normalized = (value) => String(value ?? '').trim().toUpperCase();

const staticRecords = (staticRoot) => {
  if (Array.isArray(staticRoot)) {
    return staticRoot.flatMap((root) => staticRecords(root));
  }
  if (!staticRoot || typeof staticRoot !== 'object') return [];
  if (Array.isArray(staticRoot.children)) return staticRoot.children;
  return [staticRoot];
};

const findStaticRecord = (archive, staticRoot) => {
  const identities = new Set([
    normalized(archive?.code),
    normalized(archive?.business_code),
  ].filter(Boolean));
  return staticRecords(staticRoot).find((record) =>
    identities.has(normalized(record?.code))
    || identities.has(normalized(record?.id))) ?? null;
};

export const toEditorDocumentFromOfficialArchive = (archive, staticRoot, template) => {
  const record = findStaticRecord(archive, staticRoot);
  if (!record) {
    throw new RangeError(
      `No static official archive record matches ${archive?.code || archive?.id || '(unknown archive)'}`,
    );
  }

  const title = String(archive?.title ?? record.heading ?? record.name ?? '').trim();
  const businessCode = String(archive?.business_code ?? archive?.code ?? record.code ?? '').trim();
  const legacyField = 'legacy:official-body';
  return createEditorDocument(template, {
    [template.titleKey]: title,
    [template.businessCodeKey]: businessCode,
    [legacyField]: JSON.stringify(structuredClone(record), null, 2),
  }, {
    title,
    businessCode,
    indexData: {
      ...(archive?.index_payload && typeof archive.index_payload === 'object'
        ? structuredClone(archive.index_payload)
        : {}),
      title,
    },
    sections: [{
      id: 'official-static',
      label: 'Official archive source',
      fields: [legacyField],
    }],
    fieldLabels: {
      [legacyField]: 'Official archive source',
    },
  });
};
