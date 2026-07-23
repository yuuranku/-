const fieldValue = (archive, label, fallback = '') => (
  archive.fields?.find(([key]) => key === label)?.[1]
  || archive.stats?.find(([key]) => key === label)?.[1]
  || fallback
);

const personSystem = (archive) => fieldValue(archive, '体系', archive.meta?.split(' / ')[0] || '未归档体系');
const personRole = (archive) => fieldValue(
  archive,
  '职务',
  fieldValue(archive, '专长', fieldValue(archive, '主要任职', archive.meta?.split(' / ')[1] || '未登记职务')),
);

function personRoleFamily(role) {
  if (/负责人|组织者|队长|权威|指挥/.test(role)) return 'command';
  if (/生物|生态|植被|样本/.test(role)) return 'biology';
  if (/地图|测绘|地震|地球|冰川|沉积|岩体|地质/.test(role)) return 'survey';
  if (/无线电|气象|环流|声学|卫星/.test(role)) return 'signal';
  if (/后勤|站务|生存|护卫|摄影/.test(role)) return 'field';
  return 'advisory';
}

function relationshipType(source, target) {
  const sourceSystem = personSystem(source);
  const targetSystem = personSystem(target);
  if (sourceSystem === 'HZ-6' && targetSystem === 'HZ-6') return 'same-mission';
  if (sourceSystem === targetSystem) return 'same-system';
  if (personRoleFamily(personRole(source)) === personRoleFamily(personRole(target))) return 'shared-discipline';
  return 'cross-reference';
}

function relationshipScore(selected, candidate, selectedIndex, candidateIndex, total) {
  if (candidateIndex === selectedIndex) return Number.POSITIVE_INFINITY;
  let score = 0;
  if (personSystem(selected) === personSystem(candidate)) score += 500;
  if (personRoleFamily(personRole(selected)) === personRoleFamily(personRole(candidate))) score += 180;
  if (Boolean(selected.image) === Boolean(candidate.image)) score += 20;
  const forward = (candidateIndex - selectedIndex + total) % total;
  const backward = (selectedIndex - candidateIndex + total) % total;
  score += 80 - Math.min(forward, backward) * 2;
  return score;
}

export function buildPeopleNetworkModel(entries, selectedIndex, limit = 12) {
  if (!entries.length) return { selectedIndex: 0, nodes: [], links: [] };
  const normalized = (selectedIndex + entries.length) % entries.length;
  const selected = entries[normalized];
  const rankedCandidates = entries
    .map((entry, index) => ({
      index,
      score: relationshipScore(selected, entry, normalized, index, entries.length),
    }))
    .filter(({ index }) => index !== normalized)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ index }) => index);
  const selectedSystem = personSystem(selected);
  const sameSystemIndexes = rankedCandidates
    .filter((index) => personSystem(entries[index]) === selectedSystem)
    .slice(0, Math.min(5, limit - 1));
  const crossSystemIndexes = rankedCandidates
    .filter((index) => personSystem(entries[index]) !== selectedSystem)
    .slice(0, Math.max(0, limit - 1 - sameSystemIndexes.length));
  const visibleIndexes = [normalized, ...sameSystemIndexes, ...crossSystemIndexes];
  rankedCandidates.forEach((index) => {
    if (visibleIndexes.length < Math.min(limit, entries.length) && !visibleIndexes.includes(index)) visibleIndexes.push(index);
  });

  const ringIndexes = visibleIndexes.filter((index) => index !== normalized);
  const nodes = visibleIndexes.map((index) => {
    const entry = entries[index];
    if (index === normalized) {
      return {
        index,
        code: entry.code,
        x: 50,
        y: 50,
        selected: true,
        system: personSystem(entry),
        relation: 'selected',
      };
    }
    const ringIndex = ringIndexes.indexOf(index);
    const angle = -Math.PI / 2 + (ringIndex / ringIndexes.length) * Math.PI * 2;
    const alternateRadius = ringIndex % 2 === 0 ? 1 : 0.9;
    return {
      index,
      code: entry.code,
      x: 50 + Math.cos(angle) * 40 * alternateRadius,
      y: 50 + Math.sin(angle) * 39 * alternateRadius,
      selected: false,
      system: personSystem(entry),
      relation: relationshipType(selected, entry),
    };
  });

  const links = nodes
    .filter((node) => !node.selected)
    .map((node) => ({ source: selected.code, target: node.code, type: node.relation }));
  return { selectedIndex: normalized, nodes, links };
}

const ECOLOGY_SPECIMEN_READINGS = [
  { depth: '0—20 m', temperature: '−8—−2°C', light: '散射微光', hazard: '落冰 / 融水', sample: 'EP-01', materials: ['融水滤膜', '冰顶菌膜'] },
  { depth: '20—45 m', temperature: '−5—0°C', light: '冷蓝微光', hazard: '盐壳剥落', sample: 'EP-02', materials: ['薄甲壳', '盐膜刮片'] },
  { depth: '45—90 m', temperature: '−3—2°C', light: '近零照度', hazard: '黑泥滑移', sample: 'EP-03', materials: ['蕨状叶片', '低林土样'] },
  { depth: '90—180 m', temperature: '−4—4°C', light: '无自然光', hazard: '根系绊阻', sample: 'EP-04', materials: ['黑针木根板', '空气滤芯'] },
  { depth: '180—260 m', temperature: '−1—3°C', light: '无自然光', hazard: '水体失深', sample: 'EP-05', materials: ['黑湖水样', '盲银鱼鳞片'] },
  { depth: '260—320 m', temperature: '2—18°C', light: '地热反光', hazard: '硫化物 / 陷车', sample: 'EP-06', materials: ['暖泥样', '硫化物结晶'] },
  { depth: '320 m 以下', temperature: '1—12°C', light: '完全无光', hazard: '旧骨塌陷', sample: 'EP-07', materials: ['旧骨水膜', '根板沉积物'] },
];

export function getEcologySpecimenReading(index) {
  const normalized = Math.min(Math.max(index, 0), ECOLOGY_SPECIMEN_READINGS.length - 1);
  return { layer: normalized + 1, ...ECOLOGY_SPECIMEN_READINGS[normalized] };
}
