import { getArchiveCategoryProfile } from './category-profiles.js';
import { normalizeEditorDocument } from './editor-document.js';
import { ARCHIVE_TEMPLATE_BY_CODE, ARCHIVE_TEMPLATES } from './templates.js';

const defineField = (key, label, definition = {}) => Object.freeze({
  key,
  label,
  storageKey: key,
  section: 'body',
  type: 'textarea',
  required: true,
  ...definition,
});

const nativeDefinition = (category, coreFields, optionalFields = [], defaults = {}) => {
  const categoryProfile = getArchiveCategoryProfile(category);
  const automaticKeys = new Set(category === 'event' ? ['reviewStatus'] : category === 'anomaly' ? ['status'] : []);
  return Object.freeze({
    category,
    templateCode: categoryProfile.templateCode,
    indexFields: Object.freeze(categoryProfile.indexFields.filter(({ key }) => !automaticKeys.has(key))),
    coreFields: Object.freeze(coreFields.map((field) => defineField(field.key, field.label))),
    optionalFields: Object.freeze(optionalFields.map((field) => defineField(field.key, field.label, {
      ...field,
      required: false,
      section: 'optional',
    }))),
    defaults: Object.freeze({ ...defaults }),
  });
};

export const NATIVE_FORM_PROFILES = Object.freeze({
  country: nativeDefinition('country', [defineField('countryOverview', '国家概述')]),
  organization: nativeDefinition('organization', [defineField('organizationRole', '组织职能')]),
  station: nativeDefinition('station', [defineField('stationOverview', '站点概述')]),
  entrance: nativeDefinition('entrance', [defineField('transitRiskSummary', '通行风险摘要')]),
  ecology: nativeDefinition('ecology', [
    defineField('ecologyProfile', '生态档案'),
    defineField('observationSummary', '观察摘要'),
  ]),
  person: nativeDefinition('person', [
    defineField('roleRelation', '职务关系'),
    defineField('careerSummary', '履历摘要'),
  ]),
  event: nativeDefinition('event', [
    defineField('eventOverview', '事件概述'),
    defineField('evidenceSummary', '证据摘要'),
  ], [], { reviewStatus: '待审核' }),
  anomaly: nativeDefinition('anomaly', [defineField('observationEvidence', '观察证据')], [], { status: '待审核' }),
  species: nativeDefinition('species', [defineField('featureDiscoveryRisk', '特征、发现与风险')]),
});

const templateFor = (templateOrCategory) => {
  if (templateOrCategory && typeof templateOrCategory === 'object') return templateOrCategory;
  const value = String(templateOrCategory ?? '').trim();
  return ARCHIVE_TEMPLATE_BY_CODE[value.padStart(2, '0')]
    ?? ARCHIVE_TEMPLATES.find(({ category }) => category === value);
};

export const getNativeFormProfile = (templateOrCategory) => {
  const category = typeof templateOrCategory === 'string'
    ? (templateFor(templateOrCategory)?.category ?? templateOrCategory)
    : templateOrCategory?.category;
  const profile = NATIVE_FORM_PROFILES[category];
  if (!profile) throw new RangeError(`Unknown native archive category: ${category || '(empty)'}`);
  return profile;
};

const allContentFields = (profile) => [...profile.coreFields, ...profile.optionalFields];

const valueOf = (value) => String(value ?? '');

const customEntriesFrom = (values) => {
  const entries = new Map();
  for (const [key, value] of Object.entries(values)) {
    const match = /^custom:item:([^:]+):(title|content)$/.exec(key);
    if (!match) continue;
    const entry = entries.get(match[1]) ?? { id: match[1], title: '', content: '' };
    entry[match[2]] = valueOf(value);
    entries.set(match[1], entry);
  }
  return [...entries.values()];
};

const nativeDocument = (template, document = {}) => normalizeEditorDocument({
  ...document,
  templateCode: template.code,
});

export const readNativeFormState = (template, document = {}) => {
  const profile = getNativeFormProfile(template);
  const prior = nativeDocument(template, document);
  const indexData = {};
  for (const field of profile.indexFields) {
    indexData[field.key] = valueOf(prior.indexData[field.key] ?? (field.key === 'title' ? prior.title : ''));
  }
  const isNew = !Object.keys(prior.values).length && !Object.keys(prior.indexData).length;
  for (const [key, value] of Object.entries(profile.defaults)) {
    if (prior.indexData[key] != null) indexData[key] = valueOf(prior.indexData[key]);
    else if (isNew) indexData[key] = valueOf(value);
  }
  const body = {};
  const optional = {};
  const knownKeys = new Set([template.titleKey, ...allContentFields(profile).map(({ storageKey }) => storageKey)]);
  for (const field of profile.coreFields) body[field.key] = valueOf(prior.values[field.storageKey]);
  for (const field of profile.optionalFields) optional[field.key] = valueOf(prior.values[field.storageKey]);
  const legacyFields = Object.fromEntries(Object.entries(prior.values).filter(([key]) => (
    !knownKeys.has(key) && !key.startsWith('custom:item:')
  )));
  return {
    indexData,
    body,
    optional,
    customEntries: customEntriesFrom(prior.values),
    legacyFields,
    references: structuredClone(prior.references),
    media: structuredClone(prior.media),
  };
};

const buildNativeSections = (profile, prior, values) => {
  const sections = Array.isArray(prior.sections) ? structuredClone(prior.sections) : [];
  const addSection = (id, label, fields) => {
    if (!fields.length || sections.some((section) => section.id === id)) return;
    sections.push({ id, label, fields });
  };
  addSection('native-core', '核心内容', profile.coreFields.map(({ storageKey }) => storageKey));
  addSection('native-optional', '补充内容', profile.optionalFields.map(({ storageKey }) => storageKey));
  const customFields = Object.keys(values).filter((key) => key.startsWith('custom:item:'));
  addSection('native-custom', '补充条目', customFields);
  return sections;
};

export const writeNativeFormDocument = (template, state, priorDocument = {}) => {
  const profile = getNativeFormProfile(template);
  const prior = nativeDocument(template, priorDocument);
  const indexData = { ...prior.indexData, ...(state.indexData ?? {}) };
  const values = { ...prior.values };
  for (const field of allContentFields(profile)) {
    values[field.storageKey] = valueOf(state[field.section]?.[field.key]);
  }
  for (const item of state.customEntries ?? []) {
    if (!item?.id) continue;
    values[`custom:item:${item.id}:title`] = valueOf(item.title);
    values[`custom:item:${item.id}:content`] = valueOf(item.content);
  }
  values[template.titleKey] = valueOf(indexData.title);
  const fieldLabels = { ...prior.fieldLabels };
  for (const field of allContentFields(profile)) {
    if (fieldLabels[field.storageKey] == null) fieldLabels[field.storageKey] = field.label;
  }
  return normalizeEditorDocument({
    ...prior,
    templateCode: template.code,
    category: template.category,
    title: valueOf(indexData.title),
    values,
    indexData,
    references: state.references ?? prior.references,
    media: state.media ?? prior.media,
    fieldLabels,
    sections: buildNativeSections(profile, prior, values),
  });
};

const escapeHtml = (value) => valueOf(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const constraintsHtml = (field) => {
  const required = field.required ? ' required' : '';
  if (field.type !== 'number') return required;
  return `${required}${field.min !== undefined ? ` min="${escapeHtml(field.min)}"` : ''}${field.max !== undefined ? ` max="${escapeHtml(field.max)}"` : ''}${field.step !== undefined ? ` step="${escapeHtml(field.step)}"` : ''}`;
};

const controlHtml = (name, field, value) => {
  const escapedName = escapeHtml(name);
  const escapedValue = escapeHtml(value);
  const constraints = constraintsHtml(field);
  if (field.type === 'textarea') return `<label>${escapeHtml(field.label)}<textarea name="${escapedName}" data-native-field="${escapedName}"${constraints}>${escapedValue}</textarea></label>`;
  if (field.type === 'select') {
    const options = [
      `<option value="">请选择${escapeHtml(field.label)}</option>`,
      ...(field.options ?? []).map((option) => (
        `<option value="${escapeHtml(option.value)}"${valueOf(value) === valueOf(option.value) ? ' selected' : ''}>${escapeHtml(option.label)}</option>`
      )),
    ].join('');
    return `<label>${escapeHtml(field.label)}<select name="${escapedName}" data-native-field="${escapedName}"${constraints}>${options}</select></label>`;
  }
  return `<label>${escapeHtml(field.label)}<input name="${escapedName}" data-native-field="${escapedName}" type="${escapeHtml(field.type)}" value="${escapedValue}"${constraints}></label>`;
};

export const renderNativeArchiveForm = (profile, document, options = {}) => {
  const template = templateFor(profile.templateCode);
  const state = readNativeFormState(template, document);
  const renderIndex = (field) => controlHtml(`index:${field.key}`, field, state.indexData[field.key]);
  const renderContent = (field) => controlHtml(`${field.section}:${field.key}`, field, state[field.section][field.key]);
  const legacy = Object.entries(state.legacyFields).map(([key, value]) => `<li><b>${escapeHtml(key)}</b>: ${escapeHtml(value)}</li>`).join('');
  const custom = state.customEntries.map(({ id, title, content }) => (
    `<fieldset data-native-custom-id="${escapeHtml(id)}"><input name="custom:${escapeHtml(id)}:title" value="${escapeHtml(title)}"><textarea name="custom:${escapeHtml(id)}:content">${escapeHtml(content)}</textarea></fieldset>`
  )).join('');
  return `<form data-native-archive-form="${escapeHtml(profile.category)}" ${options.readOnly ? 'data-readonly="true"' : ''}>
    <section data-native-index>${profile.indexFields.map(renderIndex).join('')}</section>
    <section data-native-core>${profile.coreFields.map(renderContent).join('')}</section>
    ${profile.optionalFields.length ? `<section data-native-optional>${profile.optionalFields.map(renderContent).join('')}</section>` : ''}
    <section data-native-custom>${custom}</section>
    <section data-native-legacy><h3>原有补充资料</h3><ul>${legacy}</ul></section>
  </form>`;
};

const controlsFor = (form) => Array.from(form?.querySelectorAll?.('input[name], textarea[name], select[name]') ?? []);

const assignControl = (control, value) => {
  if (!control) return;
  if (control.type === 'checkbox') control.checked = Boolean(value);
  else control.value = valueOf(value);
};

export const writeNativeArchiveForm = (form, profile, document) => {
  const template = templateFor(profile.templateCode);
  const state = readNativeFormState(template, document);
  const values = new Map();
  for (const field of profile.indexFields) values.set(`index:${field.key}`, state.indexData[field.key]);
  for (const field of allContentFields(profile)) values.set(`${field.section}:${field.key}`, state[field.section][field.key]);
  for (const entry of state.customEntries) {
    values.set(`custom:${entry.id}:title`, entry.title);
    values.set(`custom:${entry.id}:content`, entry.content);
  }
  for (const control of controlsFor(form)) {
    if (values.has(control.name)) assignControl(control, values.get(control.name));
  }
};

export const readNativeArchiveForm = (form, profile, priorDocument = {}) => {
  const template = templateFor(profile.templateCode);
  const state = readNativeFormState(template, priorDocument);
  const customEntries = new Map(state.customEntries.map((entry) => [entry.id, { ...entry }]));
  for (const control of controlsFor(form)) {
    const value = control.type === 'checkbox' ? String(Boolean(control.checked)) : valueOf(control.value);
    const [section, key, property] = String(control.name ?? '').split(':');
    if (section === 'index' && key) state.indexData[key] = value;
    if ((section === 'body' || section === 'optional') && key) state[section][key] = value;
    if (section === 'custom' && key && (property === 'title' || property === 'content')) {
      const entry = customEntries.get(key) ?? { id: key, title: '', content: '' };
      entry[property] = value;
      customEntries.set(key, entry);
    }
  }
  state.customEntries = [...customEntries.values()];
  return writeNativeFormDocument(template, state, priorDocument);
};

export const validateNativeFormState = (profile, state = {}) => {
  const errors = [];
  const report = (field, section, message) => {
    errors.push({ key: field.key, section, message });
  };
  const isDateValue = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const [, year, month, day] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day;
  };
  const validateField = (field, section) => {
    const value = valueOf(state[section]?.[field.key]).trim();
    if (!value) {
      if (field.required) report(field, section, `${field.label}为必填项`);
      return;
    }
    if (field.options?.length && !field.options.some((option) => option.value === value)) {
      report(field, section, `${field.label}必须选择有效选项`);
      return;
    }
    if (field.type === 'number') {
      const number = Number(value);
      if (!Number.isFinite(number)
        || (field.min !== undefined && number < field.min)
        || (field.max !== undefined && number > field.max)) {
        report(field, section, `${field.label}不在允许范围内`);
      }
      return;
    }
    if (field.type === 'date' && !isDateValue(value)) {
      report(field, section, `${field.label}必须是有效日期`);
    }
  };
  for (const field of profile.indexFields) validateField(field, 'indexData');
  for (const field of profile.coreFields) validateField(field, field.section);
  for (const field of profile.optionalFields) validateField(field, field.section);
  return { valid: errors.length === 0, errors };
};
