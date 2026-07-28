const BASE_WIDTH = 3800;
const BASE_HEIGHT = 2600;
const OVERFLOW_COLUMNS = 5;
const OVERFLOW_GUTTER = 160;
const OVERFLOW_TOP = BASE_HEIGHT + OVERFLOW_GUTTER;
const OVERFLOW_PORTRAIT = Object.freeze({ width: 350, height: 460 });
const OVERFLOW_LANDSCAPE = Object.freeze({ width: 560, height: 330 });
const OVERFLOW_ROTATIONS = Object.freeze([-3.2, 2.4, -1.8, 3, -2.6]);

export const BASE_EVENT_PLANE_LAYOUT = Object.freeze([
  { x: 110, y: 150, width: 540, height: 340, rotate: -3.8 },
  { x: 770, y: 70, width: 350, height: 460, rotate: 2.4 },
  { x: 1270, y: 180, width: 560, height: 320, rotate: -1.8 },
  { x: 2020, y: 90, width: 410, height: 430, rotate: 3.2 },
  { x: 2640, y: 170, width: 570, height: 330, rotate: -2.7 },
  { x: 3370, y: 80, width: 330, height: 460, rotate: 2.1 },
  { x: 210, y: 650, width: 410, height: 390, rotate: 2.8 },
  { x: 790, y: 650, width: 610, height: 350, rotate: -3.3 },
  { x: 1580, y: 610, width: 350, height: 450, rotate: 1.7 },
  { x: 2110, y: 670, width: 620, height: 360, rotate: -2.1 },
  { x: 2960, y: 620, width: 360, height: 450, rotate: 3.6 },
  { x: 80, y: 1160, width: 650, height: 350, rotate: -2.4 },
  { x: 930, y: 1120, width: 390, height: 430, rotate: 2.2 },
  { x: 1510, y: 1180, width: 580, height: 340, rotate: -3.1 },
  { x: 2290, y: 1120, width: 420, height: 440, rotate: 1.8 },
  { x: 2890, y: 1190, width: 730, height: 330, rotate: -1.5 },
  { x: 270, y: 1660, width: 390, height: 420, rotate: 3.1 },
  { x: 830, y: 1650, width: 640, height: 350, rotate: -2.7 },
  { x: 1670, y: 1610, width: 450, height: 450, rotate: 1.4 },
  { x: 2310, y: 1680, width: 570, height: 340, rotate: -3.4 },
  { x: 3100, y: 1620, width: 450, height: 430, rotate: 2.6 },
  { x: 100, y: 2180, width: 520, height: 300, rotate: -2.2 },
  { x: 800, y: 2120, width: 360, height: 400, rotate: 3.3 },
  { x: 1360, y: 2170, width: 690, height: 310, rotate: -1.7 },
  { x: 2280, y: 2110, width: 430, height: 410, rotate: 2.1 },
  { x: 2910, y: 2180, width: 680, height: 300, rotate: -2.9 },
].map(Object.freeze));

const overflowRow = (rowIndex) => {
  const sizes = Array.from({ length: OVERFLOW_COLUMNS }, (_, column) =>
    (rowIndex + column) % 2 === 0 ? OVERFLOW_LANDSCAPE : OVERFLOW_PORTRAIT);
  const rowWidth = sizes.reduce((total, size) => total + size.width, 0)
    + OVERFLOW_GUTTER * (OVERFLOW_COLUMNS - 1);
  let x = Math.max(80, (BASE_WIDTH - rowWidth) / 2);
  return sizes.map((size, column) => {
    const item = {
      x,
      y: OVERFLOW_TOP + rowIndex * (OVERFLOW_PORTRAIT.height + OVERFLOW_GUTTER),
      width: size.width,
      height: size.height,
      rotate: OVERFLOW_ROTATIONS[column],
    };
    x += size.width + OVERFLOW_GUTTER;
    return item;
  });
};

export function buildEventPlaneLayout(count) {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  const items = BASE_EVENT_PLANE_LAYOUT.slice(0, Math.min(total, BASE_EVENT_PLANE_LAYOUT.length))
    .map((item) => ({ ...item }));
  const overflowCount = Math.max(0, total - BASE_EVENT_PLANE_LAYOUT.length);
  const overflowRows = Math.ceil(overflowCount / OVERFLOW_COLUMNS);
  for (let row = 0; row < overflowRows; row += 1) {
    items.push(...overflowRow(row).slice(0, overflowCount - row * OVERFLOW_COLUMNS));
  }
  const maximumX = items.reduce((maximum, item) => Math.max(maximum, item.x + item.width), 0);
  const maximumY = items.reduce((maximum, item) => Math.max(maximum, item.y + item.height), 0);
  return {
    items,
    width: Math.max(BASE_WIDTH, Math.ceil(maximumX + 80)),
    height: Math.max(BASE_HEIGHT, Math.ceil(maximumY + 80)),
  };
}

export function eventPlaneVisibleCount(layout, camera, viewport) {
  const x = Number(camera?.x) || 0;
  const y = Number(camera?.y) || 0;
  const scale = Math.max(Number(camera?.scale) || 0, 0);
  const viewportWidth = Math.max(Number(viewport?.width) || 0, 0);
  const viewportHeight = Math.max(Number(viewport?.height) || 0, 0);
  return (layout?.items || []).reduce((visible, item) => {
    const left = x + item.x * scale;
    const top = y + item.y * scale;
    const right = left + item.width * scale;
    const bottom = top + item.height * scale;
    return visible + Number(
      right > 0
      && bottom > 0
      && left < viewportWidth
      && top < viewportHeight,
    );
  }, 0);
}
