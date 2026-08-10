const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const resolveResizeGeometry = ({
  rect,
  direction,
  deltaX,
  deltaY,
  minWidth = 260,
  minHeight = 180,
  maxWidth = Number.POSITIVE_INFINITY,
  maxHeight = Number.POSITIVE_INFINITY,
}) => {
  let width = rect.width;
  let height = rect.height;
  let left = rect.left;
  let top = rect.top;

  if (direction.includes('e')) width = clamp(rect.width + deltaX, minWidth, maxWidth);
  if (direction.includes('s')) height = clamp(rect.height + deltaY, minHeight, maxHeight);
  if (direction.includes('w')) {
    width = clamp(rect.width - deltaX, minWidth, maxWidth);
    left = rect.right - width;
  }
  if (direction.includes('n')) {
    height = clamp(rect.height - deltaY, minHeight, maxHeight);
    top = rect.bottom - height;
  }

  return { left, top, width, height };
};
