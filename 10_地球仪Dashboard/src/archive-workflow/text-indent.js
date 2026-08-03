export const PARAGRAPH_INDENT = '　　';

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

const lineStartAt = (value, position) => value.lastIndexOf('\n', Math.max(0, position - 1)) + 1;

const lineEndAt = (value, position) => {
  const lineEnd = value.indexOf('\n', position);
  return lineEnd === -1 ? value.length : lineEnd;
};

const selectionOffset = (position, changes) => position + changes.reduce((offset, change) => {
  if (change.delta > 0) return offset + (change.position <= position ? change.delta : 0);
  const removedEnd = change.position - change.delta;
  if (position >= removedEnd) return offset + change.delta;
  if (position > change.position) return offset + change.position - position;
  return offset;
}, 0);

export function applyTextIndent({ value, selectionStart, selectionEnd, outdent = false }) {
  const source = String(value ?? '');
  const start = clamp(Number(selectionStart) || 0, 0, source.length);
  const end = clamp(Number(selectionEnd) || start, start, source.length);
  const firstLineStart = lineStartAt(source, start);
  const selectionEndCharacter = end > start ? end - 1 : end;
  const lastLineEnd = lineEndAt(source, selectionEndCharacter);
  const lines = source.slice(firstLineStart, lastLineEnd).split('\n');
  let position = firstLineStart;
  const changes = [];
  const transformedLines = lines.map((line) => {
    const removeIndent = outdent && line.startsWith(PARAGRAPH_INDENT);
    if (removeIndent) changes.push({ position, delta: -PARAGRAPH_INDENT.length });
    if (!outdent) changes.push({ position, delta: PARAGRAPH_INDENT.length });
    position += line.length + 1;
    return removeIndent ? line.slice(PARAGRAPH_INDENT.length) : outdent ? line : `${PARAGRAPH_INDENT}${line}`;
  });
  const nextBlock = transformedLines.join('\n');
  const changed = nextBlock !== source.slice(firstLineStart, lastLineEnd);
  const nextValue = `${source.slice(0, firstLineStart)}${nextBlock}${source.slice(lastLineEnd)}`;

  return {
    value: nextValue,
    selectionStart: clamp(selectionOffset(start, changes), 0, nextValue.length),
    selectionEnd: clamp(selectionOffset(end, changes), 0, nextValue.length),
    changed,
  };
}

export function applyTextInputTabIndent(event) {
  const target = event?.target;
  if (
    event?.key !== 'Tab'
    || !(target?.matches?.('textarea') || target?.matches?.('input[type="text"]'))
    || target.disabled
    || target.readOnly
  ) return false;

  event.preventDefault?.();
  const next = applyTextIndent({
    value: target.value,
    selectionStart: target.selectionStart,
    selectionEnd: target.selectionEnd,
    outdent: event.shiftKey,
  });
  if (!next.changed) return true;
  target.value = next.value;
  target.setSelectionRange?.(next.selectionStart, next.selectionEnd);
  target.dispatchEvent?.(new Event('input', { bubbles: true }));
  return true;
}

// Backward-compatible name for existing workspace integrations.
export const applyTextareaTabIndent = applyTextInputTabIndent;
