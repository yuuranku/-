const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const sameMarks = (left, right) => Boolean(left?.bold) === Boolean(right?.bold)
  && Boolean(left?.redacted) === Boolean(right?.redacted);

const canMergeMarks = (left, right) => sameMarks(left, right)
  && !left?.redacted
  && !right?.redacted;

export const normalizeInlineMarks = (marks, textLength) => {
  const length = Math.max(0, Number(textLength) || 0);
  const source = (Array.isArray(marks) ? marks : [])
    .map((mark) => ({
      start: Math.max(0, Math.min(length, Math.floor(Number(mark?.start) || 0))),
      end: Math.max(0, Math.min(length, Math.floor(Number(mark?.end) || 0))),
      bold: Boolean(mark?.bold),
      redacted: Boolean(mark?.redacted),
    }))
    .filter((mark) => mark.end > mark.start && (mark.bold || mark.redacted));
  const boundaries = [...new Set([0, length, ...source.flatMap(({ start, end }) => [start, end])])]
    .sort((left, right) => left - right);
  const normalized = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const covering = source.filter((mark) => mark.start <= start && mark.end >= end);
    const next = {
      start,
      end,
      bold: covering.some((mark) => mark.bold),
      redacted: covering.some((mark) => mark.redacted),
    };
    if (!next.bold && !next.redacted) continue;
    const previous = normalized.at(-1);
    if (previous && previous.end === start && canMergeMarks(previous, next)) previous.end = end;
    else normalized.push(next);
  }
  return normalized.map(({ start, end, bold, redacted }) => ({
    start, end, ...(bold ? { bold: true } : {}), ...(redacted ? { redacted: true } : {}),
  }));
};

export const applyInlineMark = (marks, start, end, type, textLength = null) => {
  if (!['bold', 'redacted'].includes(type)) return normalizeInlineMarks(marks, textLength ?? end);
  const selectionStart = Math.max(0, Math.floor(Number(start) || 0));
  const selectionEnd = Math.max(selectionStart, Math.floor(Number(end) || 0));
  if (selectionEnd <= selectionStart) return normalizeInlineMarks(marks, textLength ?? selectionEnd);
  const length = Math.max(selectionEnd, Number(textLength) || 0, ...(marks || []).map((mark) => Number(mark?.end) || 0));
  const base = normalizeInlineMarks(marks, length);
  const boundaries = [...new Set([0, length, selectionStart, selectionEnd, ...base.flatMap(({ start: left, end: right }) => [left, right])])]
    .sort((left, right) => left - right);
  const next = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const left = boundaries[index];
    const right = boundaries[index + 1];
    const source = base.find((mark) => mark.start <= left && mark.end >= right) || {};
    const segment = { start: left, end: right, bold: Boolean(source.bold), redacted: Boolean(source.redacted) };
    if (left >= selectionStart && right <= selectionEnd) segment[type] = !segment[type];
    if (!segment.bold && !segment.redacted) continue;
    const previous = next.at(-1);
    if (previous && previous.end === left && canMergeMarks(previous, segment)) previous.end = right;
    else next.push(segment);
  }
  return normalizeInlineMarks(next, length);
};

export const renderInlineText = (text, marks = []) => {
  const value = String(text ?? '');
  const normalized = normalizeInlineMarks(marks, value.length);
  if (!normalized.length) return escapeHtml(value).replaceAll('\n', '<br>');
  const parts = [];
  let cursor = 0;
  const wrap = (chunk, mark) => {
    const lines = String(chunk).split('\n');
    const renderLine = (line) => {
      let result = escapeHtml(line);
      if (mark.redacted && line) result = `<span class="archive-redacted" tabindex="0" role="button" aria-label="遮蔽文字">${result}</span>`;
      return result;
    };
    let result = lines.map(renderLine).join('<br>');
    if (mark.redacted && lines.length === 1 && !lines[0]) result = '';
    if (mark.bold) result = `<strong>${result}</strong>`;
    return result;
  };
  normalized.forEach((mark) => {
    if (mark.start > cursor) parts.push(escapeHtml(value.slice(cursor, mark.start)).replaceAll('\n', '<br>'));
    parts.push(wrap(value.slice(mark.start, mark.end), mark));
    cursor = mark.end;
  });
  if (cursor < value.length) parts.push(escapeHtml(value.slice(cursor)).replaceAll('\n', '<br>'));
  return parts.join('');
};

export const extractInlineText = (root) => {
  let text = '';
  const marks = [];
  if (root && !(root.childNodes || []).length) {
    return { text: String(root.textContent ?? ''), marks: [] };
  }
  const visit = (node, state = {}) => {
    if (!node) return;
    if (node.nodeType === 3) {
      const value = String(node.nodeValue ?? '');
      const start = text.length;
      text += value;
      if (state.bold || state.redacted) marks.push({ start, end: text.length, ...state });
      return;
    }
    if (node.nodeName === 'BR') {
      text += '\n';
      return;
    }
    const next = {
      bold: state.bold || node.nodeName === 'STRONG' || node.nodeName === 'B',
      redacted: state.redacted || node.dataset?.redacted === 'true' || node.classList?.contains('archive-redacted'),
    };
    const children = [...(node.childNodes || [])];
    children.forEach((child, index) => {
      visit(child, next);
      if (['DIV', 'P', 'LI'].includes(child.nodeName) && index < children.length - 1 && !text.endsWith('\n')) text += '\n';
    });
  };
  visit(root);
  return { text, marks: normalizeInlineMarks(marks, text.length) };
};
