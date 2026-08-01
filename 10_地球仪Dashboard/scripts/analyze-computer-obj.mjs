import { readFile } from 'node:fs/promises';

const file = new URL('../public/assets/mainline/computer/desktop_shortwires.obj', import.meta.url);
const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
const vertices = [];
const faces = [];

for (const line of lines) {
  if (line.startsWith('v ')) {
    const [, x, y, z] = line.trim().split(/\s+/);
    vertices.push([Number(x), Number(y), Number(z)]);
  } else if (line.startsWith('f ')) {
    faces.push(line.trim().split(/\s+/).slice(1).map((token) => Number(token.split('/')[0]) - 1));
  }
}

const parent = vertices.map((_, index) => index);
const find = (index) => {
  while (parent[index] !== index) {
    parent[index] = parent[parent[index]];
    index = parent[index];
  }
  return index;
};
const union = (a, b) => {
  const rootA = find(a);
  const rootB = find(b);
  if (rootA !== rootB) parent[rootB] = rootA;
};

for (const face of faces) {
  for (let index = 1; index < face.length; index += 1) union(face[0], face[index]);
}

const components = new Map();
for (let index = 0; index < vertices.length; index += 1) {
  const root = find(index);
  if (!components.has(root)) components.set(root, { vertices: [], faceCount: 0 });
  components.get(root).vertices.push(index);
}
for (const face of faces) components.get(find(face[0])).faceCount += 1;

const report = [...components.values()].map((component) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const index of component.vertices) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], vertices[index][axis]);
      max[axis] = Math.max(max[axis], vertices[index][axis]);
    }
  }
  return {
    vertices: component.vertices.length,
    faces: component.faceCount,
    min: min.map((value) => Number(value.toFixed(6))),
    max: max.map((value) => Number(value.toFixed(6))),
    size: max.map((value, axis) => Number((value - min[axis]).toFixed(6))),
  };
}).sort((a, b) => b.faces - a.faces);

const measuredFaces = faces.map((face) => {
  const origin = vertices[face[0]];
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let index = 1; index < face.length - 1; index += 1) {
    const a = vertices[face[index]].map((value, axis) => value - origin[axis]);
    const b = vertices[face[index + 1]].map((value, axis) => value - origin[axis]);
    nx += a[1] * b[2] - a[2] * b[1];
    ny += a[2] * b[0] - a[0] * b[2];
    nz += a[0] * b[1] - a[1] * b[0];
  }
  const magnitude = Math.hypot(nx, ny, nz) || 1;
  const points = face.map((index) => vertices[index]);
  const min = [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis])));
  const max = [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis])));
  return {
    vertices: face.length,
    area: magnitude / 2,
    normal: [nx / magnitude, ny / magnitude, nz / magnitude],
    min,
    max,
    center: min.map((value, axis) => (value + max[axis]) / 2),
  };
});

const faceReport = (items) => items
  .sort((a, b) => b.area - a.area)
  .slice(0, 30)
  .map((face) => Object.fromEntries(Object.entries(face).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.map((number) => Number(number.toFixed(6))) : Number(value.toFixed(8)),
  ])));

const frontFaces = faceReport(measuredFaces.filter((face) => Math.abs(face.normal[1]) > 0.96 && face.center[2] > 0.15));
const depthFacingFaces = faceReport(measuredFaces.filter((face) => Math.abs(face.normal[2]) > 0.96));
const allBounds = vertices.reduce((bounds, point) => ({
  min: bounds.min.map((value, axis) => Math.min(value, point[axis])),
  max: bounds.max.map((value, axis) => Math.max(value, point[axis])),
}), { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });

console.log(JSON.stringify({
  vertexCount: vertices.length,
  faceCount: faces.length,
  componentCount: report.length,
  bounds: {
    min: allBounds.min,
    max: allBounds.max,
    size: allBounds.max.map((value, axis) => value - allBounds.min[axis]),
  },
  largestComponents: report.slice(0, 30),
  largestFrontFacingFaces: frontFaces,
  largestDepthFacingFaces: depthFacingFaces,
}, null, 2));
