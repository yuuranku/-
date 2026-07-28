import { ARCHIVE_TEMPLATE_BY_CODE } from './templates.js';
import { normalizeArchiveMedia } from './media.js';

export const EDITOR_DOCUMENT_SCHEMA_VERSION = 2;

const normalizeTemplateCode = (value) => String(value ?? '').trim().padStart(2, '0');

const cloneRecord = (value) => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? structuredClone(value)
    : {}
);

const cloneList = (value) => (Array.isArray(value) ? structuredClone(value) : []);

const templateFor = (value) => {
  if (value && typeof value === 'object' && value.code) return value;
  const code = normalizeTemplateCode(value);
  const template = ARCHIVE_TEMPLATE_BY_CODE[code];
  if (!template) throw new RangeError(`Unknown archive template: ${code || '(empty)'}`);
  return template;
};

export const templateArchiveAbbreviation = (templateCode) =>
  templateFor(templateCode).abbreviation;

export const createEditorDocument = (templateValue, values = {}, extras = {}) => {
  const template = templateFor(templateValue);
  const documentValues = cloneRecord(values);
  return {
    schemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
    templateCode: template.code,
    category: template.category,
    abbreviation: template.abbreviation,
    title: String(documentValues[template.titleKey] ?? extras.title ?? '').trim(),
    businessCode: String(
      documentValues[template.businessCodeKey] ?? extras.businessCode ?? '',
    ).trim(),
    values: documentValues,
    indexData: cloneRecord(extras.indexData),
    sections: cloneList(extras.sections),
    fieldLabels: cloneRecord(extras.fieldLabels),
    references: cloneList(extras.references),
    media: normalizeArchiveMedia(extras.media),
  };
};

export const normalizeEditorDocument = (value = {}) => {
  const template = templateFor(value.templateCode);
  const values = cloneRecord(value.values ?? value.fields);
  const normalized = createEditorDocument(template, values, {
    title: value.title,
    businessCode: value.businessCode ?? value.archiveCode,
    indexData: value.indexData,
    sections: value.sections,
    fieldLabels: value.fieldLabels,
    references: value.references,
    media: value.media,
  });
  return {
    ...normalized,
    indexData: cloneRecord(value.indexData),
    sections: cloneList(value.sections),
    fieldLabels: cloneRecord(value.fieldLabels),
    references: cloneList(value.references),
    media: normalizeArchiveMedia(value.media),
  };
};
