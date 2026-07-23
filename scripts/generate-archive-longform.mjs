import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, '..');
const sourceDir = resolve(projectDir, '..', '02_世界观设定', '13_九类档案扩写稿_待确认');

const categories = [
  ['countries', '01_国家档案_1964.md', 'N'],
  ['organizations', '02_组织档案.md', 'O'],
  ['stations', '03_科考站档案_1964.md', '(?:US|SU|UK|FR|AU|NZ|AR|CL)-'],
  ['entrances', '04_白幕入口档案_1964.md', '(?:US|SU|CN|NC|FR|AU)-'],
  ['ecology', '05_生态分层档案.md', 'E'],
  ['people', '06_人物档案.md', 'P'],
  ['events', '07_事件档案.md', 'V'],
  ['abnormalities', '08_异常事件档案.md', 'A'],
  ['species', '09_物种档案.md', 'S'],
];

function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function cleanInline(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .trim();
}

function parseBlocks(lines) {
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    if (/^#{2,5}\s+/.test(line)) {
      blocks.push({ type: 'heading', text: line.replace(/^#{2,5}\s+/, '').trim() });
      index += 1;
      continue;
    }

    if (line.startsWith('|') && lines[index + 1]?.trim().match(/^\|?\s*:?-{3,}/)) {
      const header = splitTableRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ''));
        index += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    if (line.startsWith('>')) {
      const quote = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quote.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'blockquote', text: quote.join(' ') });
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || next.startsWith('|') || next.startsWith('>') || /^#{2,5}\s+/.test(next) || /^[-*]\s+/.test(next)) break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }

  return blocks;
}

function stripFencedBlocks(markdown) {
  let insideFence = false;
  let fencePair = 0;
  let keepContents = false;
  return markdown.replace(/\r\n/g, '\n').split('\n').filter((line) => {
    if (line.trim().startsWith('```')) {
      if (!insideFence) {
        fencePair += 1;
        keepContents = fencePair === 2;
      }
      insideFence = !insideFence;
      if (!insideFence) keepContents = false;
      return false;
    }
    return !insideFence || keepContents;
  });
}

function addSectionHeadings(blocks, titles) {
  return blocks.flatMap((block, index) => [
    { type: 'heading', text: titles[index] || `补充记录 ${String(index + 1).padStart(2, '0')}`, section: 'event-section' },
    { ...block, section: 'event-section' },
  ]);
}

function insertImageAfterSection(event, afterSection, imageBlock) {
  const headingIndex = event.blocks.findIndex((block) => block.type === 'heading' && block.text === afterSection);
  if (headingIndex < 0) throw new Error(`event image ${event.code}: section not found: ${afterSection}`);
  const nextHeadingOffset = event.blocks.slice(headingIndex + 1).findIndex((block) => block.type === 'heading');
  const insertAt = nextHeadingOffset < 0 ? event.blocks.length : headingIndex + 1 + nextHeadingOffset;
  event.blocks.splice(insertAt, 0, { ...imageBlock, type: 'image', section: 'event-image' });
}

function parseEntries(markdown, codePrefix) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const codePattern = new RegExp(`^(#{2,3})\\s+((?:${codePrefix})\\d{1,2}|(?:${codePrefix})[A-Z0-9]+)\\s+(.+)$`);
  const starts = [];

  lines.forEach((line, index) => {
    const match = line.trim().match(codePattern);
    if (match) starts.push({ index, level: match[1].length, code: match[2], title: match[3].trim() });
  });

  return starts.map((entry, entryIndex) => {
    const next = starts[entryIndex + 1];
    let end = next?.index ?? lines.length;
    for (let index = entry.index + 1; index < end; index += 1) {
      const heading = lines[index].trim().match(/^(#{1,3})\s+/);
      if (heading && heading[1].length <= entry.level) {
        end = index;
        break;
      }
    }

    const parsed = parseBlocks(lines.slice(entry.index + 1, end));
    const firstTableIndex = parsed.findIndex((block) => block.type === 'table');
    const facts = firstTableIndex >= 0
      ? parsed[firstTableIndex].rows.map((row) => [row[0] || '字段', row.slice(1).join(' / ') || '未录'])
      : [];
    const blocks = parsed.filter((_, index) => index !== firstTableIndex);
    const summaryBlock = blocks.find((block) => block.type === 'paragraph');

    return {
      code: entry.code,
      title: entry.title,
      summary: cleanInline(summaryBlock?.text || entry.title),
      facts,
      blocks,
    };
  });
}

const archive = {};
const counts = {};

for (const [category, filename, codePrefix] of categories) {
  const markdown = await readFile(resolve(sourceDir, filename), 'utf8');
  const entries = parseEntries(markdown, codePrefix);
  archive[category] = Object.fromEntries(entries.map((entry) => [entry.code, entry]));
  counts[category] = entries.length;
}

const personnelHistoryPath = resolve(sourceDir, '06A_人物履历表.md');
const personnelHistoryMarkdown = await readFile(personnelHistoryPath, 'utf8');
const personnelHistories = parseEntries(personnelHistoryMarkdown, 'P');

if (personnelHistories.length !== 32) {
  throw new Error(`personnel histories: expected 32 entries, received ${personnelHistories.length}`);
}

personnelHistories.forEach((history) => {
  const person = archive.people[history.code];
  if (!person) throw new Error(`personnel histories: unknown person ${history.code}`);
  const roleBlocks = person.blocks.map((block) => ({
    ...block,
    text: block.type === 'heading' && block.text === '档案补记' ? '项目职责与方法' : block.text,
    section: 'person-role',
  }));
  const historyBlocks = history.blocks.map((block) => ({
    ...block,
    section: block.type === 'heading' && /状态|结案|核验/.test(block.text)
      ? 'person-status'
      : 'person-history',
  }));
  person.facts = history.facts;
  person.blocks = [...roleBlocks, ...historyBlocks];
  person.personHistoryCount = person.blocks.filter((block) => block.type === 'heading').length;
});

const stationRosterPath = resolve(sourceDir, '03A_科考站驻扎名册.md');
const stationRosterMarkdown = await readFile(stationRosterPath, 'utf8');
const stationRosters = parseEntries(stationRosterMarkdown, '(?:US|SU|UK|FR|AU|NZ|AR|CL)-');
const expectedStationRosterCounts = {
  'US-MCM': 4,
  'US-SP': 4,
  'US-BYD': 3,
  'SU-MIR': 4,
  'SU-VOS': 4,
  'SU-NOV': 3,
  'UK-HAL': 3,
  'UK-SIG': 2,
  'UK-F': 3,
  'UK-D': 2,
  'FR-DDU': 3,
  'FR-CHA': 2,
  'AU-MAW': 3,
  'AU-DAV': 3,
  'AU-WIL': 3,
  'NZ-SCO': 3,
  'AR-ORC': 3,
  'AR-ESP': 3,
  'CL-PRT': 3,
  'CL-OHI': 3,
};

if (stationRosters.length !== Object.keys(expectedStationRosterCounts).length) {
  throw new Error(`station rosters: expected ${Object.keys(expectedStationRosterCounts).length} station sections, received ${stationRosters.length}`);
}

stationRosters.forEach((roster) => {
  const station = archive.stations[roster.code];
  if (!station) throw new Error(`station rosters: unknown station ${roster.code}`);
  const recordBlocks = roster.blocks.filter((block) => !(block.type === 'paragraph' && cleanInline(block.text) === roster.summary));
  const recordCount = recordBlocks.filter((block) => block.type === 'heading').length;
  if (recordCount !== expectedStationRosterCounts[roster.code]) {
    throw new Error(`station rosters ${roster.code}: expected ${expectedStationRosterCounts[roster.code]} records, received ${recordCount}`);
  }
  station.blocks = [
    { type: 'heading', text: '站务、任务与公开站史', section: 'station-overview' },
    ...station.blocks.map((block) => ({ ...block, section: 'station-overview' })),
    { type: 'heading', text: '历史驻扎名册', section: 'station-roster-intro' },
    { type: 'paragraph', text: roster.summary, section: 'station-roster-intro' },
    ...recordBlocks.map((block) => ({ ...block, section: 'station-roster' })),
  ];
  station.stationRosterCount = recordCount;
});

const entranceLogPath = resolve(sourceDir, '04A_白幕入口进入记录.md');
const entranceLogMarkdown = await readFile(entranceLogPath, 'utf8');
const entranceLogs = parseEntries(entranceLogMarkdown, '(?:US|SU|CN|NC|FR|AU)-');
const expectedEntranceLogCounts = {
  'US-K1': 6,
  'US-K2': 8,
  'US-K4': 2,
  'US-K7': 4,
  'SU-D1': 7,
  'SU-D3': 9,
  'SU-D6': 4,
  'SU-Z9': 3,
  'CN-HY0': 4,
  'CN-KL1': 5,
  'CN-SL2': 3,
  'CN-RS3': 4,
  'NC-N1': 6,
  'NC-T2': 3,
  'NC-L3': 2,
  'FR-C1': 5,
  'FR-O2': 4,
  'AU-W1': 3,
};

if (entranceLogs.length !== Object.keys(expectedEntranceLogCounts).length) {
  throw new Error(`entrance logs: expected ${Object.keys(expectedEntranceLogCounts).length} entrance sections, received ${entranceLogs.length}`);
}

entranceLogs.forEach((log) => {
  const entrance = archive.entrances[log.code];
  if (!entrance) throw new Error(`entrance logs: unknown entrance ${log.code}`);
  const recordBlocks = log.blocks.filter((block) => !(block.type === 'paragraph' && cleanInline(block.text) === log.summary));
  const recordCount = recordBlocks.filter((block) => block.type === 'heading').length;
  if (recordCount !== expectedEntranceLogCounts[log.code]) {
    throw new Error(`entrance logs ${log.code}: expected ${expectedEntranceLogCounts[log.code]} records, received ${recordCount}`);
  }
  const judgementBlocks = entrance.blocks.filter((block) => block.type === 'paragraph' && !block.text.includes('04A_白幕入口进入记录.md'));
  entrance.blocks = [
    { type: 'heading', text: '入口判定' },
    ...judgementBlocks,
    { type: 'heading', text: '进入记录' },
    { type: 'paragraph', text: log.summary },
    ...recordBlocks,
  ];
  entrance.entryRecordCount = recordCount;
});

const germanEventPath = resolve(projectDir, '..', '03_事件档案', '1938-1939_德国南极考察暗片带事件.md');
const germanEvent = await readFile(germanEventPath, 'utf8');
const germanBlocks = parseBlocks(germanEvent.replace(/\r\n/g, '\n').split('\n').slice(1));
const germanFactsHeading = germanBlocks.findIndex((block) => block.type === 'heading' && block.text === '档案抬头');
const germanFactsTable = germanBlocks.findIndex((block) => block.type === 'table');
const germanNarrative = germanBlocks.filter((_, index) => index !== germanFactsHeading && index !== germanFactsTable);
const germanSummary = germanNarrative.find((block) => block.type === 'paragraph');
archive.events.V00 = {
  ...archive.events.V00,
  summary: cleanInline(germanSummary?.text || archive.events.V00.summary),
  blocks: germanNarrative,
};

const hz6ReportPath = resolve(projectDir, '..', '03_事件档案', '1952_HZ-6样本线任务报告_中文译本.md');
const hz6Report = await readFile(hz6ReportPath, 'utf8');
const hz6ReportLines = stripFencedBlocks(hz6Report);
const hz6ReportBlocks = parseBlocks(hz6ReportLines.slice(1));
archive.events.V04 = {
  ...archive.events.V04,
  blocks: hz6ReportBlocks.map((block) => ({ ...block, section: 'event-section' })),
};

const eventSectionTitles = {
  V01: ['前置格网复核', '航片异常', '返航点名冲突', '资料封装', '后续聚合'],
  V02: ['独立发现', '交涉与底片', '复制链'],
  V03: ['钻探经过', '样本拆分', '结论与未决'],
  V05: ['双值班经过', '设施与处置'],
  V06: ['常设后勤成形', '设备与合同分流', '制度后果'],
  V07: ['队伍编制', '失联与归队', '远端呼号', '程序修订', '名册状态'],
  V08: ['短时转移', '双清单封存'],
  V09: ['调查阶段', '证据采集', '协作与现状'],
};

Object.entries(eventSectionTitles).forEach(([code, titles]) => {
  const event = archive.events[code];
  if (event.blocks.length !== titles.length) {
    throw new Error(`event ${code}: expected ${titles.length} narrative blocks, received ${event.blocks.length}`);
  }
  event.blocks = addSectionHeadings(event.blocks, titles);
});

const eventImageLayoutPath = resolve(sourceDir, '07A_事件影像编排.md');
const eventImageLayoutMarkdown = await readFile(eventImageLayoutPath, 'utf8');
const eventImageTable = parseBlocks(eventImageLayoutMarkdown.replace(/\r\n/g, '\n').split('\n')).find((block) => block.type === 'table');
if (!eventImageTable || eventImageTable.rows.length !== 7) {
  throw new Error(`event images: expected 7 layout rows, received ${eventImageTable?.rows.length || 0}`);
}

eventImageTable.rows.forEach(([code, src, afterSection, layout, alt, caption, note]) => {
  const event = archive.events[code];
  if (!event) throw new Error(`event images: unknown event ${code}`);
  insertImageAfterSection(event, afterSection, { src, layout, alt, caption, note });
});

Object.values(archive.events).forEach((event) => {
  event.eventSectionCount = event.blocks.filter((block) => block.type === 'heading').length;
  event.inlineImageCount = event.blocks.filter((block) => block.type === 'image').length;
});

const expected = {
  countries: 18,
  organizations: 22,
  stations: 20,
  entrances: 18,
  ecology: 7,
  people: 32,
  events: 10,
  abnormalities: 16,
  species: 22,
};

for (const [category, count] of Object.entries(expected)) {
  if (counts[category] !== count) {
    throw new Error(`${category}: expected ${count} entries, received ${counts[category]}`);
  }
}

const output = `// 此文件由 scripts/generate-archive-longform.mjs 从九类本地母稿生成。\n// 修改母稿后重新运行 npm run archive:sync；请勿直接编辑本文件。\n\nexport const ARCHIVE_LONGFORM = ${JSON.stringify(archive, null, 2)};\n\nexport const ARCHIVE_LONGFORM_COUNTS = ${JSON.stringify(counts, null, 2)};\n`;

await writeFile(resolve(projectDir, 'src', 'archive-longform.js'), output, 'utf8');
console.log(JSON.stringify(counts));
