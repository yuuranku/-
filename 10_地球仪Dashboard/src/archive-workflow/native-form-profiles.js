import { getArchiveCategoryProfile } from './category-profiles.js';
import { normalizeEditorDocument } from './editor-document.js';
import { extractInlineText, renderInlineText } from './inline-text-format.js';
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

const defineAnomalyField = (key, eventLabel, objectLabel, definition = {}) => defineField(key, eventLabel, {
  ...definition,
  anomalyLabels: Object.freeze({ EVENT: eventLabel, OBJECT: objectLabel }),
});

const nativeDefinition = (category, coreFields, optionalFields = [], defaults = {}) => {
  const categoryProfile = getArchiveCategoryProfile(category);
  const automaticKeys = new Set(category === 'event' ? ['reviewStatus'] : category === 'anomaly' ? ['status'] : []);
  return Object.freeze({
    category,
    templateCode: categoryProfile.templateCode,
    indexFields: Object.freeze(categoryProfile.indexFields.filter(({ key, nativeHidden }) => (
      !automaticKeys.has(key) && !nativeHidden
    ))),
    coreFields: Object.freeze(coreFields.map((field) => defineField(field.key, field.label, field))),
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
  organization: nativeDefinition('organization', [
    defineField('institutionNumber', '机构号', { required: false }),
    defineField('activePeriod', '适用年代', { required: false }),
    defineField('organizationNature', '组织性质', { required: false }),
    defineField('powerStructure', '权力结构', { required: false }),
    defineField('standingDepartments', '常设部门', { required: false }),
    defineField('frontlineUnits', '前线机构', { required: false }),
  ]),
  station: nativeDefinition('station', [defineField('stationOverview', '站务、任务与公开站史')]),
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
    defineField('missionNumber', '任务编号', { required: false }),
    defineField('missionDate', '任务日期', { required: false }),
    defineField('missionArea', '任务区域', { required: false }),
    defineField('teamStatus', '队伍状态', { required: false }),
    defineField('missionContent', '任务内容', { required: false }),
    defineField('archiveStatus', '档案状态', { required: false }),
  ], [], { reviewStatus: '待审核' }),
  anomaly: nativeDefinition('anomaly', [
    defineField('anomalyTime', '时间', { required: false }),
    defineField('anomalyLocation', '地点', { required: false }),
    defineAnomalyField('anomalyCategory', '异常类型', '物件类别', { required: false }),
    defineAnomalyField('anomalyManifestation', '异常表现', '异常特征', { required: false }),
    defineAnomalyField('anomalyInitialRecord', '首次异常', '发现经过', { required: false }),
    defineAnomalyField('anomalyBasis', '核验依据', '收容依据', { required: false }),
  ], [], { status: '待审核', anomalyKind: 'EVENT' }),
  species: nativeDefinition('species', [
    defineField('temporaryTaxonomy', '现代临时分类', { required: false }),
    defineField('scale', '尺度', { required: false }),
    defineField('primaryLayer', '主要层', { required: false }),
    defineField('specimenState', '标本状态', { required: false }),
  ]),
});

const MAINLINE_EXPERIENCE_FIELDS = Object.freeze([
  defineField('experienceTime', '经历时间', { required: false, section: 'optional' }),
  defineField('experienceLocation', '经历地点', { required: false, section: 'optional' }),
  defineField('experienceNarrative', '事件经历记录', { required: false, section: 'optional', type: 'textarea' }),
  defineField('experiencePersonnel', '接触人员与状态', { required: false, section: 'optional', type: 'textarea' }),
  defineField('experienceMaterials', '使用或取得的材料', { required: false, section: 'optional', type: 'textarea' }),
  defineField('experienceLimits', '限制、风险与未解事项', { required: false, section: 'optional', type: 'textarea' }),
]);

const templateFor = (templateOrCategory) => {
  if (templateOrCategory && typeof templateOrCategory === 'object') return templateOrCategory;
  const value = String(templateOrCategory ?? '').trim();
  return ARCHIVE_TEMPLATE_BY_CODE[value.padStart(2, '0')]
    ?? ARCHIVE_TEMPLATES.find(({ category }) => category === value);
};

export const getNativeFormProfile = (templateOrCategory, options = {}) => {
  const category = typeof templateOrCategory === 'string'
    ? (templateFor(templateOrCategory)?.category ?? templateOrCategory)
    : templateOrCategory?.category;
  const profile = NATIVE_FORM_PROFILES[category];
  if (!profile) throw new RangeError(`Unknown native archive category: ${category || '(empty)'}`);
  if (category !== 'event' || options.mainlineExperience !== true) return profile;
  return Object.freeze({
    ...profile,
    optionalFields: Object.freeze([...profile.optionalFields, ...MAINLINE_EXPERIENCE_FIELDS]),
  });
};

const allContentFields = (profile) => [...profile.coreFields, ...profile.optionalFields];

const valueOf = (value) => String(value ?? '');

const normalizeEventStartDate = (value) => {
  const source = valueOf(value).trim();
  const match = /^(\d{4})\s*(?:年|[./-])\s*(\d{1,2})\s*(?:月|[./-])\s*(\d{1,2})\s*(?:日)?/.exec(source);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const anomalyKindFor = (state = {}) => valueOf(state.indexData?.anomalyKind).trim() === 'OBJECT'
  ? 'OBJECT'
  : 'EVENT';

const visibleFieldLabel = (field, state) => field.anomalyLabels?.[anomalyKindFor(state)] || field.label;

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
  if (profile.category === 'anomaly' && !indexData.anomalyKind) indexData.anomalyKind = 'EVENT';
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
  addSection(
    'native-core',
    profile.category === 'organization' ? 'MANDATE / AUTHORITY / SOURCE CHAIN' : '核心内容',
    profile.coreFields.map(({ storageKey }) => storageKey),
  );
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
  if (profile.category === 'event') {
    const startDate = normalizeEventStartDate(values.missionDate);
    const location = valueOf(values.missionArea).trim();
    if (startDate) indexData.startDate = startDate;
    if (location) indexData.location = location;
    if (!valueOf(indexData.reviewStatus).trim()) indexData.reviewStatus = profile.defaults.reviewStatus;
  }
  for (const item of state.customEntries ?? []) {
    if (!item?.id) continue;
    values[`custom:item:${item.id}:title`] = valueOf(item.title);
    values[`custom:item:${item.id}:content`] = valueOf(item.content);
  }
  values[template.titleKey] = valueOf(indexData.title);
  const fieldLabels = { ...prior.fieldLabels };
  for (const field of allContentFields(profile)) {
    if (field.anomalyLabels) fieldLabels[field.storageKey] = visibleFieldLabel(field, state);
    else if (fieldLabels[field.storageKey] == null) fieldLabels[field.storageKey] = field.label;
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

const controlHtml = (name, field, value, marks = []) => {
  const escapedName = escapeHtml(name);
  const escapedValue = escapeHtml(value);
  const constraints = constraintsHtml(field);
  const anomalyLabelAttributes = field.anomalyLabels
    ? ` data-native-anomaly-label data-label-event="${escapeHtml(field.anomalyLabels.EVENT)}" data-label-object="${escapeHtml(field.anomalyLabels.OBJECT)}"`
    : '';
  const label = `<span data-native-field-label>${escapeHtml(field.label)}</span>`;
  if (field.type === 'textarea') return `<label${anomalyLabelAttributes}>${label}<div class="archive-rich-editor" contenteditable="true" role="textbox" aria-multiline="true" data-native-rich-field="${escapedName}" name="${escapedName}">${renderInlineText(value, marks)}</div><textarea name="${escapedName}" data-native-field="${escapedName}" data-native-field-storage="${escapedName}" hidden${constraints}>${escapedValue}</textarea></label>`;
  if (field.type === 'select') {
    const options = [
      `<option value="">请选择${escapeHtml(field.label)}</option>`,
      ...(field.options ?? []).map((option) => (
        `<option value="${escapeHtml(option.value)}"${valueOf(value) === valueOf(option.value) ? ' selected' : ''}>${escapeHtml(option.label)}</option>`
      )),
    ].join('');
    const referenceAttribute = field.referenceCategory
      ? ` data-native-reference-category="${escapeHtml(field.referenceCategory)}"`
      : '';
    return `<label${anomalyLabelAttributes}>${label}<select name="${escapedName}" data-native-field="${escapedName}"${referenceAttribute}${constraints}>${options}</select></label>`;
  }
  return `<label${anomalyLabelAttributes}>${label}<input name="${escapedName}" data-native-field="${escapedName}" type="${escapeHtml(field.type)}" value="${escapedValue}"${constraints}></label>`;
};

export const syncNativeAnomalyFieldLabels = (form, profile) => {
  if (profile?.category !== 'anomaly') return;
  const anomalyKind = valueOf(form?.querySelector?.('[name="index:anomalyKind"]')?.value).trim() === 'OBJECT'
    ? 'OBJECT'
    : 'EVENT';
  form?.querySelectorAll?.('[data-native-anomaly-label]').forEach((label) => {
    const fieldLabel = label.querySelector('[data-native-field-label]');
    if (fieldLabel) fieldLabel.textContent = label.dataset[`label${anomalyKind[0]}${anomalyKind.slice(1).toLowerCase()}`] || '';
  });
};

export const renderNativeArchiveForm = (profile, document, options = {}) => {
  const template = templateFor(profile.templateCode);
  const state = readNativeFormState(template, document);
  const marksFor = (name) => document?.inlineMarks?.[name] || [];
  const renderIndex = (field) => controlHtml(`index:${field.key}`, field, state.indexData[field.key], marksFor(`index:${field.key}`));
  const renderContent = (field) => controlHtml(`${field.section}:${field.key}`, field, state[field.section][field.key], marksFor(`${field.section}:${field.key}`));
  const custom = state.customEntries.map(({ id, title, content }) => (
    `<fieldset data-native-custom-id="${escapeHtml(id)}"><input name="custom:${escapeHtml(id)}:title" data-native-custom-title value="${escapeHtml(title)}"><div class="archive-rich-editor" contenteditable="true" role="textbox" aria-multiline="true" data-native-rich-field="custom:${escapeHtml(id)}:content" name="custom:${escapeHtml(id)}:content">${renderInlineText(content, marksFor(`custom:item:${id}:content`))}</div><textarea name="custom:${escapeHtml(id)}:content" data-native-field-storage="custom:${escapeHtml(id)}:content" data-native-custom-content hidden>${escapeHtml(content)}</textarea></fieldset>`
  )).join('');
  const form = `<form data-native-archive-form="${escapeHtml(profile.category)}" ${options.readOnly ? 'data-readonly="true"' : ''}>
    <section data-native-index>${profile.indexFields.map(renderIndex).join('')}</section>
    <section data-native-core>${profile.coreFields.map(renderContent).join('')}</section>
    ${profile.optionalFields.length ? `<section data-native-optional>${profile.optionalFields.map(renderContent).join('')}</section>` : ''}
    <section data-native-custom>${custom}</section>
  </form>`;
  return form;
};

const controlsFor = (form) => Array.from(form?.querySelectorAll?.('input[name], textarea[name], select[name], [data-native-rich-field][name]') ?? []);
const isRichControl = (control) => control?.matches?.('[data-native-rich-field]');
const storageControlFor = (form, name) => form?.querySelector?.(`[data-native-field-storage="${CSS.escape(name)}"]`);
const controlName = (control) => control?.name || control?.getAttribute?.('name') || '';

const assignControl = (control, value) => {
  if (!control) return;
  if (isRichControl(control)) return;
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
    const name = controlName(control);
    if (!values.has(name)) continue;
    const value = values.get(name);
    if (isRichControl(control)) {
      const [section, key, property] = String(name).split(':');
      const markKey = section === 'custom' && property === 'content'
        ? `custom:item:${key}:content`
        : `${section}:${key}`;
      control.innerHTML = renderInlineText(value, document?.inlineMarks?.[markKey] || []);
      const storage = storageControlFor(form, name);
      if (storage) assignControl(storage, value);
    } else {
      assignControl(control, value);
    }
  }
  syncNativeAnomalyFieldLabels(form, profile);
};

export const readNativeArchiveForm = (form, profile, priorDocument = {}) => {
  const template = templateFor(profile.templateCode);
  const state = readNativeFormState(template, priorDocument);
  const customEntries = new Map(state.customEntries.map((entry) => [entry.id, { ...entry }]));
  const inlineMarks = { ...(priorDocument.inlineMarks || {}) };
  for (const control of controlsFor(form)) {
    if (control.matches?.('[data-native-field-storage]')) continue;
    const extracted = isRichControl(control) ? extractInlineText(control) : null;
    const value = extracted ? extracted.text : control.type === 'checkbox' ? String(Boolean(control.checked)) : valueOf(control.value);
    const [section, key, property] = String(controlName(control)).split(':');
    if (section === 'index' && key) state.indexData[key] = value;
    if ((section === 'body' || section === 'optional') && key) state[section][key] = value;
    if (section === 'custom' && key && (property === 'title' || property === 'content')) {
      const entry = customEntries.get(key) ?? { id: key, title: '', content: '' };
      entry[property] = value;
      customEntries.set(key, entry);
      if (property === 'content') {
        const markKey = `custom:item:${key}:content`;
        if (extracted?.marks?.length) inlineMarks[markKey] = extracted.marks;
        else delete inlineMarks[markKey];
      }
    }
    if (extracted && section !== 'custom' && key) {
      const markKey = `${section}:${key}`;
      if (extracted.marks.length) inlineMarks[markKey] = extracted.marks;
      else delete inlineMarks[markKey];
    }
  }
  state.customEntries = [...customEntries.values()];
  return {
    ...writeNativeFormDocument(template, state, priorDocument),
    inlineMarks,
  };
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
    if (field.options?.length && !field.dynamicOptions && !field.options.some((option) => option.value === value)) {
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
