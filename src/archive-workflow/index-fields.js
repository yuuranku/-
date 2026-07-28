import { getArchiveCategoryProfile } from './category-profiles.js';

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const normalizeFieldValue = (field, input) => {
  const text = String(input ?? '').trim();
  if (!text) return '';
  if (field.type === 'number') {
    const number = Number(text);
    return Number.isFinite(number) ? number : text;
  }
  if (field.options) return text.toUpperCase();
  return text;
};

const isMissingOrInvalid = (field, value) => {
  if (value === '' || value === null || value === undefined) return field.required;
  if (field.options && !field.options.some((option) => option.value === value)) return true;
  if (field.type === 'number') {
    if (!Number.isFinite(value)) return true;
    if (field.min !== undefined && value < field.min) return true;
    if (field.max !== undefined && value > field.max) return true;
  }
  return false;
};

export const normalizeArchiveIndexData = (category, input = {}) => {
  const profile = getArchiveCategoryProfile(category);
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return Object.fromEntries(profile.indexFields.map((field) => [
    field.key,
    normalizeFieldValue(field, source[field.key]),
  ]));
};

export const validateArchiveIndexData = (category, input = {}) => {
  const profile = getArchiveCategoryProfile(category);
  const value = normalizeArchiveIndexData(category, input);
  const missing = profile.indexFields
    .filter((field) => isMissingOrInvalid(field, value[field.key]))
    .map((field) => field.key);
  return {
    valid: missing.length === 0,
    missing,
    value,
  };
};

const renderOptions = (field, value) => [
  `<option value="">请选择${escapeHtml(field.label)}</option>`,
  ...field.options.map((option) => `
    <option value="${escapeHtml(option.value)}"${value === option.value ? ' selected' : ''}>
      ${escapeHtml(option.label)}
    </option>
  `),
].join('');

const renderControl = (field, value) => {
  const common = `name="index:${escapeHtml(field.key)}" data-index-key="${escapeHtml(field.key)}"`;
  if (field.type === 'select') {
    return `<select ${common}${field.required ? ' required' : ''}>${renderOptions(field, value)}</select>`;
  }
  const numberRules = field.type === 'number'
    ? ` min="${field.min}" max="${field.max}" step="${field.step || 'any'}"`
    : '';
  return `<input ${common} type="${escapeHtml(field.type)}" value="${escapeHtml(value)}"${numberRules}${field.required ? ' required' : ''} />`;
};

export const renderArchiveIndexFields = (category, input = {}) => {
  const profile = getArchiveCategoryProfile(category);
  const value = normalizeArchiveIndexData(category, input);
  return `
    <section class="archive-index-editor" data-archive-index-panel data-index-category="${escapeHtml(category)}">
      <header>
        <div>
          <b>目录归类与索引登记</b>
          <span>这些字段决定档案在九类公开目录中的名称、分组与位置。</span>
        </div>
        <em>INDEX / ${escapeHtml(profile.abbreviation)}</em>
      </header>
      <div class="archive-index-editor__errors" data-index-errors role="alert" hidden></div>
      <div class="archive-index-editor__fields">
        ${profile.indexFields.map((field) => `
          <label data-archive-index-field="${escapeHtml(field.key)}">
            <span>${escapeHtml(field.label)}${field.required ? '<i>必填</i>' : '<i>可空</i>'}</span>
            ${renderControl(field, value[field.key])}
          </label>
        `).join('')}
      </div>
    </section>
  `;
};
