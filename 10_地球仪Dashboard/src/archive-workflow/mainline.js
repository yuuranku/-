import * as THREE from 'three';
import ThreeGlobe from 'three-globe';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { RESEARCH_STATIONS } from '../data.js';
import {
  MAINLINE_DEFAULT_VERSION,
  annotateMainlineDocument,
  mainlinePartState,
  mainlineStageIsOpen,
  visibleMainlineVersions,
} from './mainline-domain.js';
import { renderFormalArchiveDocument } from './public-renderer.js';

const COMPUTER_ROOT = '/assets/mainline/computer';
const MAINLINE_ICON = '/assets/icons/archive-event.svg';
const DEFAULT_PERSON_PORTRAIT = '/assets/archive/person-default.png';
const MAINLINE_SCENE_SLOT = '__PALIS_MAINLINE_ACTIVE_SCENE__';

globalThis[MAINLINE_SCENE_SLOT]?.();
delete globalThis[MAINLINE_SCENE_SLOT];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const subscribeToMainlineChanges = (client, refresh) => {
  if (typeof client?.subscribeMainlineChanges !== 'function') return () => {};
  try {
    let changedWhileHidden = false;
    const reloadIfVisible = () => {
      if (document.visibilityState !== 'visible') {
        changedWhileHidden = true;
        return;
      }
      changedWhileHidden = false;
      void refresh();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && changedWhileHidden) reloadIfVisible();
    };
    const unsubscribe = client.subscribeMainlineChanges(reloadIfVisible);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  } catch {
    return () => {};
  }
};

const clampPart = (value) => Math.min(7, Math.max(1, Number.parseInt(value, 10) || 1));

const normalizePartBriefing = (briefing = {}) => ({
  summary: String(briefing.summary ?? '').trim(),
  objective: String(briefing.objective ?? '').trim(),
  location: String(briefing.location ?? '').trim(),
  stationCode: String(briefing.stationCode ?? '').trim(),
  time: String(briefing.time ?? '').trim(),
  knownMaterials: String(briefing.knownMaterials ?? '').trim(),
  constraints: String(briefing.constraints ?? '').trim(),
});

const briefingText = (briefing = {}) => {
  const normalized = normalizePartBriefing(briefing);
  return [normalized.summary, normalized.objective, normalized.location, normalized.time,
    normalized.knownMaterials, normalized.constraints].filter(Boolean).join('\n');
};

const DEFAULT_PART_STATIONS = ['SU-NOV', 'US-MCM', 'SU-VOS', 'UK-HAL', 'FR-DDU', 'AU-DAV', 'NZ-SCO'];

const resolveMissionStation = (briefing = {}, part = 1) => {
  const stationCode = String(briefing.stationCode || '').trim().toLocaleLowerCase('zh-CN');
  const location = String(briefing.location || '').trim().toLocaleLowerCase('zh-CN');
  const exact = RESEARCH_STATIONS.find((station) => station.code.toLocaleLowerCase('zh-CN') === stationCode);
  if (exact) return exact;
  const matched = location && RESEARCH_STATIONS.find((station) => [station.code, station.name, station.english]
    .filter(Boolean)
    .some((value) => location.includes(String(value).toLocaleLowerCase('zh-CN'))));
  return matched || RESEARCH_STATIONS.find((station) => station.code === DEFAULT_PART_STATIONS[clampPart(part) - 1]) || RESEARCH_STATIONS[0];
};

const stationOptionsMarkup = (selectedCode = '') => RESEARCH_STATIONS.map((station) => `
  <option value="${escapeHtml(station.code)}" ${station.code === selectedCode ? 'selected' : ''}>${escapeHtml(station.code)} · ${escapeHtml(station.name)} / ${escapeHtml(station.english)}</option>
`).join('');

const normalizeVersionBriefing = (version = {}) => {
  const briefing = version.briefing && typeof version.briefing === 'object' ? version.briefing : {};
  const activePart = clampPart(briefing.activePart);
  const parts = {};
  for (let part = 1; part <= 7; part += 1) {
    const configured = briefing.parts?.[String(part)];
    const legacy = !configured && part === activePart ? briefing : {};
    const state = mainlinePartState(version, part);
    parts[String(part)] = {
      ...normalizePartBriefing(configured || legacy),
      status: state.status,
      activeStage: state.activeStage,
    };
  }
  return { activePart, parts };
};

const partBriefing = (version, part = null) => {
  const workflow = normalizeVersionBriefing(version);
  return workflow.parts[String(clampPart(part ?? workflow.activePart))];
};

const serializeVersionBriefing = (current, workflow) => {
  const active = workflow.parts[String(workflow.activePart)] || normalizePartBriefing();
  return {
    ...current.briefing,
    ...normalizePartBriefing(active),
    activePart: workflow.activePart,
    parts: workflow.parts,
  };
};

const defaultVersions = () => [{
  ...MAINLINE_DEFAULT_VERSION,
  cover_url: '/assets/ver-0-1-cover.jpg',
  briefing: {},
}];

const stageLabel = (stage) => [
  '全部封存',
  '阶段 1 / 人员建档',
  '阶段 2 / 事件经历',
  '阶段 3 / 正式归档',
][stage] || '全部封存';

const stageSummary = (stage) => [
  '',
  '',
  '使用事件经历记录字段，并沿用既有草稿、附件、提交、审核和打回流程。',
  '管理员汇总已提交的经历材料，并进入既有正式事件表单。',
][stage] || '';

const stageTask = (stage, role) => {
  const tasks = {
    1: {
      title: '人物共创',
      prompt: '为本次行动建立可被采用的行动人员。',
      action: '查看可认领岗位',
      support: '从下方人员空位中选择一个岗位，进入既有的人物档案表单。',
    },
    2: {
      title: '补完事件经历',
      prompt: '围绕本次行动，补完行动人员的经历与材料。',
      action: '进入事件经历记录',
      support: '将使用既有事件表单的经历字段，并继续沿用现有审核流程。',
    },
    3: {
      title: '正式事件汇编',
      prompt: role === 'admin'
        ? '整合已有的行动材料，建立正式事件档案。'
        : '本阶段由管理员整合材料，并进行正式归档。',
      action: role === 'admin' ? '进入材料汇编' : '',
      support: role === 'admin'
        ? '将进入现有的正式事件表单；不会创建新的审核或归档机制。'
        : '你可以查阅此前阶段的记录，等待管理员完成汇编。',
    },
  };
  return tasks[stage] || tasks[1];
};

const entranceMarkup = () => `
  <section class="mainline-entry" data-mainline-entry aria-label="档案纠错程序入口">
    <canvas data-mainline-computer-canvas tabindex="0" role="button" aria-label="点击复古电脑显示屏，进入档案纠错程序"></canvas>
    <button class="mainline-entry__hotspot" type="button" data-mainline-enter aria-label="进入档案纠错程序"></button>
    <output class="mainline-entry__load" data-mainline-model-status aria-live="polite">正在装载纠错终端…</output>
  </section>
`;

const filmMarkup = () => `
  <section class="mainline-film" data-mainline-film tabindex="0" aria-label="版本选择器">
    <header>
      <div><b>版本选择器</b><span>ARCHIVE VERSION SELECTOR</span></div>
      <output data-mainline-film-status aria-live="polite">读取版本中…</output>
    </header>
    <div class="mainline-film__viewport" data-mainline-film-viewport>
      <button class="mainline-film__arrow is-prev" type="button" data-mainline-film-prev aria-label="上一个版本">←</button>
      <canvas class="mainline-film__canvas" data-mainline-film-canvas aria-label="版本选择器中的三维螺旋胶片"></canvas>
      <div class="mainline-film__accessible" data-mainline-film-accessible aria-label="可选择版本"></div>
      <button class="mainline-film__arrow is-next" type="button" data-mainline-film-next aria-label="下一个版本">→</button>
    </div>
    <footer>
      <span>滚轮 / 方向键 / 拖动切换 · 点击中央胶片进入</span>
    </footer>
  </section>
`;

const briefingWindowMarkup = () => `
  <section class="mainline-brief" data-mainline-brief>
    <header class="mainline-brief__mast">
      <div data-mainline-version-heading></div>
      <output data-mainline-status aria-live="polite"></output>
    </header>
    <div class="mainline-brief__layout">
      <aside class="mainline-brief__rail">
        <nav class="mainline-brief__progress" data-mainline-part-progress aria-label="版本任务进度"></nav>
        <section class="mainline-brief__legend" aria-label="行动图例">
          <b>相关行动主体</b>
          <span><i class="is-red"></i>本次行动站点</span>
          <span><i class="is-blue"></i>协作站点网络</span>
          <span><i class="is-navy"></i>PALIS 档案节点</span>
          <span><i class="is-gray"></i>待核定资料</span>
        </section>
        <footer>PALIS · CHANNEL 09A<br /><span>ARCHIVE MODE</span></footer>
      </aside>
      <main class="mainline-brief__center">
        <header class="mainline-brief__hero" data-mainline-hero></header>
        <section class="mainline-brief__atlas" aria-label="行动站点地球视图">
          <canvas data-mainline-station-canvas aria-label="网站地球与当前行动站点"></canvas>
          <div class="mainline-brief__station" data-mainline-station-label></div>
          <section class="mainline-brief__mission" data-mainline-briefing></section>
        </section>
        <section class="mainline-brief__vacancies" data-mainline-slot-overview></section>
      </main>
      <aside class="mainline-brief__inspector">
        <section class="mainline-brief__focus" data-mainline-stage-focus></section>
        <section class="mainline-brief__stages" data-mainline-stage-entries></section>
      </aside>
      <section class="mainline-brief__admin" data-mainline-admin></section>
    </div>
  </section>
`;

const createMissionGlobe = (canvas) => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 800);
    camera.position.set(0, 0, 328);
  const globeRoot = new THREE.Group();
  scene.add(globeRoot);
  const globe = new ThreeGlobe({ animateIn: false })
    .globeImageUrl('/textures/earth-blue-marble.jpg')
    .bumpImageUrl('/textures/earth-topology.png')
    .showAtmosphere(true)
    .atmosphereColor('#b9d7d2')
    .atmosphereAltitude(0.1);
  const globeMaterial = globe.globeMaterial();
  globeMaterial.color = new THREE.Color('#d7ddda');
  globeMaterial.bumpScale = 2.2;
  globeMaterial.shininess = 4;
  globeMaterial.specular = new THREE.Color('#7b9690');
  globeMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      float waLuma = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
      vec2 waCell = mod(floor(gl_FragCoord.xy), 4.0);
      float waIndex = waCell.x + waCell.y * 4.0;
      float waThreshold = 0.5;
      if (waIndex == 0.0) waThreshold = 0.03;
      else if (waIndex == 1.0) waThreshold = 0.53;
      else if (waIndex == 2.0) waThreshold = 0.16;
      else if (waIndex == 3.0) waThreshold = 0.66;
      else if (waIndex == 4.0) waThreshold = 0.78;
      else if (waIndex == 5.0) waThreshold = 0.28;
      else if (waIndex == 6.0) waThreshold = 0.91;
      else if (waIndex == 7.0) waThreshold = 0.41;
      else if (waIndex == 8.0) waThreshold = 0.22;
      else if (waIndex == 9.0) waThreshold = 0.72;
      else if (waIndex == 10.0) waThreshold = 0.09;
      else if (waIndex == 11.0) waThreshold = 0.59;
      else if (waIndex == 12.0) waThreshold = 0.97;
      else if (waIndex == 13.0) waThreshold = 0.47;
      else if (waIndex == 14.0) waThreshold = 0.84;
      else if (waIndex == 15.0) waThreshold = 0.34;
      float waInk = smoothstep(waThreshold - 0.08, waThreshold + 0.08, waLuma);
      gl_FragColor.rgb = mix(vec3(0.018), vec3(0.94), waInk);`,
    );
  };
  globeMaterial.needsUpdate = true;
  globeRoot.add(globe);
  scene.add(new THREE.AmbientLight(0x879692, 2.05));
  scene.add(new THREE.HemisphereLight(0xe7eee9, 0x020403, 1.2));
  const keyLight = new THREE.DirectionalLight(0xf3f5e9, 3.2);
  keyLight.position.set(-170, 110, 230);
  scene.add(keyLight);
  const markerRoot = new THREE.Group();
  globe.add(markerRoot);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xe34f42, depthTest: false });
  const haloMaterial = new THREE.MeshBasicMaterial({ color: 0xe34f42, transparent: true, opacity: 0.74, side: THREE.DoubleSide, depthTest: false });
  const marker = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 1.4), markerMaterial);
  const halo = new THREE.Mesh(new THREE.RingGeometry(3.8, 4.6, 32), haloMaterial);
  markerRoot.add(marker, halo);
  const southPole = globe.getCoords(-90, 0, 0);
  const southRotation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(southPole.x, southPole.y, southPole.z).normalize(),
    new THREE.Vector3(0, 0, 1),
  );
  globe.quaternion.copy(southRotation);
  let currentStation = null;

  const setStation = (station) => {
    if (!station) return;
    currentStation = station;
    const point = globe.getCoords(station.lat, station.lng, 0.024);
    markerRoot.position.set(point.x, point.y, point.z);
    markerRoot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), markerRoot.position.clone().normalize());
    globe.quaternion.copy(southRotation);
    canvas.dataset.stationCode = station.code;
  };

  let width = 0;
  let height = 0;
  const resize = () => {
    const nextWidth = Math.max(1, Math.round(canvas.clientWidth || 1));
    const nextHeight = Math.max(1, Math.round(canvas.clientHeight || 1));
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth;
    height = nextHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sceneWindow = canvas.closest('.archive-workflow-window');
  let animationFrame = 0;
  let lastRenderedAt = -Infinity;
  const render = (time = 0) => {
    resize();
    if ((!sceneWindow || sceneWindow.classList.contains('is-active')) && time - lastRenderedAt >= 32) {
      const pulse = reducedMotion ? 1 : 1 + Math.sin(time / 430) * 0.14;
      halo.scale.setScalar(pulse);
      haloMaterial.opacity = reducedMotion ? 0.72 : 0.46 + Math.sin(time / 430) * 0.22;
      globeRoot.rotation.z = reducedMotion ? 0 : Math.sin(time / 6200) * 0.012;
      renderer.render(scene, camera);
      lastRenderedAt = time;
    }
    animationFrame = requestAnimationFrame(render);
  };
  render();
  canvas.dataset.globeSource = 'site-archive-globe';
  return {
    setStation,
    get station() { return currentStation; },
    dispose() {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      globeMaterial.map?.dispose?.();
      globeMaterial.bumpMap?.dispose?.();
      globe.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
        else object.material?.dispose?.();
      });
      renderer.dispose();
    },
  };
};

const stageWindowMarkup = (stage) => `
  <section class="mainline-stage" data-mainline-stage="${stage}">
    <header class="mainline-stage__mast">
      <div><b>阶段 ${stage}</b><span>${escapeHtml(stageLabel(stage))}</span></div>
      <output data-mainline-stage-status aria-live="polite"></output>
    </header>
    ${stageSummary(stage) ? `<p class="mainline-stage__summary">${escapeHtml(stageSummary(stage))}</p>` : ''}
    <main data-mainline-stage-content></main>
  </section>
`;

const fitPerspectiveCamera = (
  camera,
  bounds,
  safeFrame = 0.84,
  targetOffsetX = 0,
  cameraLift = 0.035,
  targetLift = 0.025,
) => {
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const distanceForHeight = size.y / (2 * Math.tan(verticalFov / 2) * safeFrame);
  const distanceForWidth = size.x / (2 * Math.tan(horizontalFov / 2) * safeFrame);
  const distance = Math.max(distanceForHeight, distanceForWidth) + size.z / 2;
  const targetX = center.x + size.x * targetOffsetX;
  camera.position.set(targetX, center.y + size.y * cameraLift, center.z + distance);
  camera.near = Math.max(0.05, distance - size.z * 2.2);
  camera.far = distance + size.z * 5 + 24;
  const target = new THREE.Vector3(targetX, center.y + size.y * targetLift, center.z);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  return target;
};

const createCrtScreenGeometry = () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.133, -0.038, 0.3970,
    0.054, -0.038, 0.3970,
    -0.133, 0.112, 0.3867,
    0.054, 0.112, 0.3867,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 0, 1, 1, 1,
  ], 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
};

const createComputerScene = (canvas, status, keyboardEntry, onEnter) => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a110e, 8, 18);
  const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
  camera.position.set(0, 0.3, 7);

  canvas.dataset.renderer = 'WebGLRenderer';
  canvas.dataset.bloomBranch = 'local-crt-additive';
  canvas.dataset.cameraFit = 'pending';

  scene.add(new THREE.HemisphereLight(0xd8e6db, 0x101713, 0.86));
  const key = new THREE.DirectionalLight(0xfff4dc, 3.1);
  key.position.set(-4.2, 6.4, 5.8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.00035;
  key.shadow.normalBias = 0.025;
  scene.add(key);
  const fill = new THREE.PointLight(0x7ea894, 2.2, 13);
  fill.position.set(-3.8, 0.4, 3.5);
  scene.add(fill);
  const rim = new THREE.PointLight(0x4bd89b, 4.1, 14);
  rim.position.set(4.4, 2.5, -2.4);
  scene.add(rim);

  const archiveEarthGroup = new THREE.Group();
  archiveEarthGroup.position.set(0, -3.15, -8.8);
  archiveEarthGroup.rotation.set(-0.16, 0.26, -0.035);
  const earthGeometry = new THREE.SphereGeometry(5.7, 64, 36);
  const earthTexture = new THREE.TextureLoader().load('/textures/earth-blue-marble.jpg');
  earthTexture.colorSpace = THREE.SRGBColorSpace;
  earthTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const earthMaterial = new THREE.MeshBasicMaterial({
    map: earthTexture,
    color: 0x6da487,
    transparent: true,
    opacity: 0.19,
    depthWrite: false,
    fog: false,
  });
  const earthSurface = new THREE.Mesh(earthGeometry, earthMaterial);
  const earthGridMaterial = new THREE.MeshBasicMaterial({
    color: 0x86d5a4,
    transparent: true,
    opacity: 0.024,
    wireframe: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const earthGrid = new THREE.Mesh(earthGeometry.clone(), earthGridMaterial);
  earthGrid.scale.setScalar(1.006);
  const atmosphereMaterial = new THREE.MeshBasicMaterial({
    color: 0x65d99a,
    transparent: true,
    opacity: 0.048,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(5.92, 48, 28), atmosphereMaterial);
  archiveEarthGroup.add(earthSurface, earthGrid, atmosphere);
  scene.add(archiveEarthGroup);
  canvas.dataset.atmosphere = 'archive-earth-layer';

  const root = new THREE.Group();
  const computerFacing = -Math.PI / 9;
  root.rotation.y = computerFacing;
  scene.add(root);

  const groundFadeCanvas = document.createElement('canvas');
  groundFadeCanvas.width = 512;
  groundFadeCanvas.height = 512;
  const groundFadeContext = groundFadeCanvas.getContext('2d');
  const groundFade = groundFadeContext.createRadialGradient(256, 250, 54, 256, 250, 250);
  groundFade.addColorStop(0, '#ffffff');
  groundFade.addColorStop(0.5, '#e8e8e8');
  groundFade.addColorStop(0.82, '#666666');
  groundFade.addColorStop(1, '#000000');
  groundFadeContext.fillStyle = groundFade;
  groundFadeContext.fillRect(0, 0, 512, 512);
  const groundFadeTexture = new THREE.CanvasTexture(groundFadeCanvas);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x111813,
    roughness: 0.96,
    metalness: 0.04,
    alphaMap: groundFadeTexture,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 18), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2.24;
  ground.receiveShadow = true;
  scene.add(ground);

  const crtCanvas = document.createElement('canvas');
  crtCanvas.width = 768;
  crtCanvas.height = 512;
  const crt = crtCanvas.getContext('2d');
  const crtTexture = new THREE.CanvasTexture(crtCanvas);
  crtTexture.colorSpace = THREE.SRGBColorSpace;
  crtTexture.minFilter = THREE.LinearFilter;
  crtTexture.magFilter = THREE.LinearFilter;
  const screenMaterial = new THREE.MeshBasicMaterial({
    map: crtTexture,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const screen = new THREE.Mesh(createCrtScreenGeometry(), screenMaterial);
  screen.name = 'MAINLINE_DYNAMIC_CRT';

  let computerTexture = null;
  const modelGeometries = new Set();
  let fittedBounds = null;
  let loadedMaterials = null;
  let screenReady = false;
  let zoom = null;
  let entered = false;
  const baseCameraPosition = new THREE.Vector3();
  const baseCameraTarget = new THREE.Vector3();
  const parallaxIntent = new THREE.Vector2();
  const parallaxCurrent = new THREE.Vector2();
  const cameraRight = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();
  const screenLocalCenter = new THREE.Vector3();
  const screenWorldCenter = new THREE.Vector3();

  const refit = () => {
    if (!fittedBounds || zoom) return;
    const fittedTarget = fitPerspectiveCamera(camera, fittedBounds, 1.48, 0, 0.3, 0.075);
    screen.geometry.boundingBox.getCenter(screenLocalCenter);
    screenWorldCenter.copy(screenLocalCenter);
    screen.localToWorld(screenWorldCenter);
    camera.position.x += screenWorldCenter.x - fittedTarget.x;
    camera.position.y += screenWorldCenter.y - fittedTarget.y;
    baseCameraTarget.copy(screenWorldCenter);
    camera.lookAt(baseCameraTarget);
    baseCameraPosition.copy(camera.position);
    canvas.dataset.cameraFit = 'pass';
    canvas.dataset.cameraAnchor = 'crt-screen-center';
  };

  const objLoader = new OBJLoader();
  new MTLLoader().setPath(`${COMPUTER_ROOT}/`).load('desktop_shortwires.mtl', (materials) => {
    loadedMaterials = materials;
    materials.preload();
    computerTexture = new THREE.TextureLoader().load(`${COMPUTER_ROOT}/computer_texture.png`);
    computerTexture.colorSpace = THREE.SRGBColorSpace;
    computerTexture.flipY = true;
    computerTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const surfaceMaterial = materials.materials.None || Object.values(materials.materials)[0];
    if (surfaceMaterial) {
      surfaceMaterial.map = computerTexture;
      surfaceMaterial.color.set(0xffffff);
      surfaceMaterial.side = THREE.DoubleSide;
      surfaceMaterial.shininess = 18;
      surfaceMaterial.specular?.set(0x4f554f);
      surfaceMaterial.needsUpdate = true;
    }
    objLoader.setMaterials(materials);
    objLoader.setPath(`${COMPUTER_ROOT}/`).load('desktop_shortwires.obj', (model) => {
      model.rotation.x = 0;
      model.updateMatrixWorld(true);
      const original = new THREE.Box3().setFromObject(model);
      const size = original.getSize(new THREE.Vector3());
      const scale = 5.25 / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(scale);
      model.updateMatrixWorld(true);
      const scaled = new THREE.Box3().setFromObject(model);
      const center = scaled.getCenter(new THREE.Vector3());
      model.position.sub(center);
      model.position.y -= 0.15;
      model.traverse((node) => {
        if (!node.isMesh) return;
        if (node.geometry) modelGeometries.add(node.geometry);
        node.castShadow = true;
        node.receiveShadow = true;
        const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
        nodeMaterials.filter(Boolean).forEach((material) => {
          if ('shininess' in material) material.shininess = Math.min(22, material.shininess || 18);
          material.specular?.set(0x4f554f);
        });
      });
      model.add(screen);
      root.add(model);
      root.updateMatrixWorld(true);
      screenReady = true;
      const modelBounds = new THREE.Box3().setFromObject(root);
      fittedBounds = modelBounds.clone().expandByScalar(0.14);
      ground.position.y = modelBounds.min.y + 0.006;
      const shadowCenter = fittedBounds.getCenter(new THREE.Vector3());
      key.target.position.copy(shadowCenter);
      scene.add(key.target);
      const shadowSpan = fittedBounds.getSize(new THREE.Vector3()).length() * 0.62;
      key.shadow.camera.left = -shadowSpan;
      key.shadow.camera.right = shadowSpan;
      key.shadow.camera.top = shadowSpan;
      key.shadow.camera.bottom = -shadowSpan;
      key.shadow.camera.near = 0.1;
      key.shadow.camera.far = 24;
      key.shadow.camera.updateProjectionMatrix();
      refit();
      canvas.dataset.modelLoaded = 'true';
      canvas.dataset.modelSource = 'desktop_shortwires.obj';
      canvas.dataset.screenAnchor = 'mesh-face-pass';
      status.textContent = '纠错终端已就绪 · 点击显示屏';
    }, undefined, () => {
      canvas.dataset.modelLoaded = 'false';
      canvas.dataset.cameraFit = 'failed';
      status.textContent = '电脑模型载入失败 · 可按 Enter 继续';
    });
  }, undefined, () => {
    canvas.dataset.modelLoaded = 'false';
    canvas.dataset.cameraFit = 'failed';
    status.textContent = '电脑材质载入失败 · 可按 Enter 继续';
  });

  const resizeTarget = canvas.parentElement || canvas;
  let viewportWidth = 0;
  let viewportHeight = 0;
  const resize = () => {
    const width = Math.max(1, Math.round(resizeTarget.clientWidth || canvas.clientWidth || 1));
    const height = Math.max(1, Math.round(resizeTarget.clientHeight || canvas.clientHeight || 1));
    viewportWidth = width;
    viewportHeight = height;
    renderer.setSize(width, height, false);
    canvas.dataset.cssSize = `${width}x${height}`;
    canvas.dataset.bufferSize = `${canvas.width}x${canvas.height}`;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    refit();
  };

  const startedAt = performance.now();
  const sceneWindow = canvas.closest('.archive-workflow-window');
  const drawCrt = (time) => {
    const elapsed = time - startedAt;
    const bootProgress = Math.min(1, elapsed / 1900);
    crt.fillStyle = '#010403';
    crt.fillRect(0, 0, 768, 512);
    const glow = crt.createRadialGradient(384, 226, 18, 384, 226, 430);
    glow.addColorStop(0, '#123f30');
    glow.addColorStop(0.62, '#082219');
    glow.addColorStop(1, '#010403');
    crt.fillStyle = glow;
    crt.fillRect(0, 0, 768, 512);
    crt.fillStyle = '#dcffe5';
    crt.font = '700 50px "Microsoft YaHei", sans-serif';
    crt.fillText('档案纠错程序', 70, 135);
    crt.fillStyle = '#86caa0';
    crt.font = '20px monospace';
    crt.fillText('PALIS ARCHIVE CORRECTION TERMINAL', 72, 182);
    if (bootProgress < 1) {
      crt.strokeStyle = '#6cb98a';
      crt.strokeRect(74, 276, 620, 42);
      crt.fillStyle = '#9ff1b8';
      crt.fillRect(82, 284, 604 * bootProgress, 26);
      crt.font = '18px monospace';
      crt.fillText(`READING ARCHIVE INDEX ${Math.round(bootProgress * 100).toString().padStart(3, '0')}%`, 74, 352);
    } else {
      crt.fillStyle = time % 1050 < 720 ? '#e1ffe9' : '#6dae82';
      crt.font = '700 25px "Microsoft YaHei", sans-serif';
      crt.fillText('> 点击显示屏开始纠错_', 74, 302);
      crt.fillStyle = '#74a786';
      crt.font = '17px monospace';
      crt.fillText('AUTHORIZED: CLERK / ADMIN', 74, 349);
    }
    crt.fillStyle = 'rgba(210,255,221,.10)';
    for (let y = 0; y < 512; y += 5) crt.fillRect(0, y + ((time / 46) % 5), 768, 1);
    crtTexture.needsUpdate = true;
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const screenHit = (event) => {
    if (!screenReady) return false;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(screen, false).length > 0;
  };

  const beginEnter = () => {
    if (entered) {
      onEnter?.();
      return;
    }
    if (zoom) return;
    if (!screenReady) {
      entered = true;
      onEnter?.();
      return;
    }
    root.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const screenCenter = screen.getWorldPosition(new THREE.Vector3());
    const screenNormal = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(screen.getWorldQuaternion(new THREE.Quaternion()))
      .normalize();
    const screenSize = new THREE.Box3().setFromObject(screen).getSize(new THREE.Vector3());
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
    const distance = Math.max(
      screenSize.y / (2 * Math.tan(verticalFov / 2) * 0.72),
      screenSize.x / (2 * Math.tan(horizontalFov / 2) * 0.72),
    );
    const targetCamera = camera.clone();
    targetCamera.position.copy(screenCenter).addScaledVector(screenNormal, distance);
    targetCamera.lookAt(screenCenter);
    zoom = {
      startedAt: performance.now(),
      duration: reducedMotion ? 220 : 820,
      startPosition: camera.position.clone(),
      startQuaternion: camera.quaternion.clone(),
      endPosition: targetCamera.position.clone(),
      endQuaternion: targetCamera.quaternion.clone(),
    };
    status.textContent = '正在接入档案纠错程序…';
    canvas.dataset.entering = 'true';
  };

  let pointerStart = null;
  const onPointerDown = (event) => { pointerStart = { x: event.clientX, y: event.clientY }; };
  const onPointerMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    parallaxIntent.set(
      THREE.MathUtils.clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1),
      THREE.MathUtils.clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1),
    );
    canvas.dataset.screenHover = String(screenHit(event));
  };
  const onPointerLeave = () => {
    canvas.dataset.screenHover = 'false';
    parallaxIntent.set(0, 0);
  };
  const onPointerUp = (event) => {
    if (!pointerStart) return;
    const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    pointerStart = null;
    if (moved > 8) return;
    // The imported OBJ has no separately named CRT mesh.  A ray hit is still
    // used for cursor feedback, but a normal click on the terminal must not
    // become a dead end when the artist's screen face and the hit plane differ.
    if (screenHit(event) || screenReady || fittedBounds) beginEnter();
    pointerStart = null;
  };
  const onKeyDown = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    beginEnter();
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('keydown', onKeyDown);
  keyboardEntry.addEventListener('click', beginEnter);

  let animationFrame = 0;
  let lastRenderedAt = -Infinity;
  const render = (time = 0) => {
    const active = !sceneWindow || sceneWindow.classList.contains('is-active');
    if (active && time - lastRenderedAt >= 32) {
      const liveWidth = Math.max(1, Math.round(resizeTarget.clientWidth || canvas.clientWidth || 1));
      const liveHeight = Math.max(1, Math.round(resizeTarget.clientHeight || canvas.clientHeight || 1));
      if (liveWidth !== viewportWidth || liveHeight !== viewportHeight) resize();
      drawCrt(time);
      if (zoom) {
        const rawProgress = Math.min(1, (time - zoom.startedAt) / zoom.duration);
        const progress = 1 - ((1 - rawProgress) ** 3);
        camera.position.lerpVectors(zoom.startPosition, zoom.endPosition, progress);
        camera.quaternion.slerpQuaternions(zoom.startQuaternion, zoom.endQuaternion, progress);
        if (rawProgress >= 1 && !entered) {
          entered = true;
          canvas.dataset.entering = 'complete';
          onEnter?.();
        }
      } else if (!reducedMotion && fittedBounds) {
        parallaxCurrent.lerp(parallaxIntent, 0.085);
        camera.quaternion.normalize();
        cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
        cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
        camera.position.copy(baseCameraPosition)
          .addScaledVector(cameraRight, parallaxCurrent.x * 0.24)
          .addScaledVector(cameraUp, -parallaxCurrent.y * 0.14);
        camera.lookAt(baseCameraTarget);
      }
      if (!reducedMotion) {
        archiveEarthGroup.rotation.y += 0.00012;
        archiveEarthGroup.position.x = parallaxCurrent.x * -0.18;
        archiveEarthGroup.position.y = -3.15 + parallaxCurrent.y * 0.08;
      }
      renderer.render(scene, camera);
      lastRenderedAt = time;
    }
    animationFrame = requestAnimationFrame(render);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(resizeTarget);
  resize();
  render();

  const dispose = () => {
    cancelAnimationFrame(animationFrame);
    observer.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('keydown', onKeyDown);
    keyboardEntry.removeEventListener('click', beginEnter);
    modelGeometries.forEach((geometry) => geometry.dispose());
    Object.values(loadedMaterials?.materials || {}).forEach((material) => material.dispose?.());
    ground.geometry.dispose();
    groundMaterial.dispose();
    groundFadeTexture.dispose();
    earthGeometry.dispose();
    earthGrid.geometry.dispose();
    atmosphere.geometry.dispose();
    earthMaterial.dispose();
    earthGridMaterial.dispose();
    atmosphereMaterial.dispose();
    earthTexture.dispose();
    screen.geometry.dispose();
    screenMaterial.dispose();
    crtTexture.dispose();
    computerTexture?.dispose();
    renderer.dispose();
    if (globalThis[MAINLINE_SCENE_SLOT] === dispose) delete globalThis[MAINLINE_SCENE_SLOT];
  };
  globalThis[MAINLINE_SCENE_SLOT] = dispose;
  return dispose;
};

const futureFilmFrames = (versions) => {
  const frames = versions.map((version) => ({ version }));
  let minor = Math.max(0, ...versions.map(({ code }) => Number(String(code).split('.')[1]) || 0)) + 1;
  while (frames.length < Math.max(9, versions.length)) {
    frames.push({ placeholder: `0.${minor}` });
    minor += 1;
  }
  return frames;
};

const createFilmFrameTexture = (frame) => {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 480;
  const context = canvas.getContext('2d');
  const version = frame.version;
  const draw = (image = null) => {
    context.fillStyle = '#030706';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (image) {
      const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    } else {
      const gradient = context.createRadialGradient(360, 205, 20, 360, 205, 430);
      gradient.addColorStop(0, version ? '#234c38' : '#17211c');
      gradient.addColorStop(1, '#020403');
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = 'rgba(169, 222, 182, .22)';
      for (let x = -240; x < 900; x += 48) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x + 300, 480);
        context.stroke();
      }
    }
    const shade = context.createLinearGradient(0, 140, 0, 480);
    shade.addColorStop(0, 'rgba(1, 4, 3, 0)');
    shade.addColorStop(0.55, 'rgba(1, 4, 3, .38)');
    shade.addColorStop(1, 'rgba(1, 4, 3, .96)');
    context.fillStyle = shade;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = version ? '#dfffe8' : '#75857a';
    context.font = '700 42px monospace';
    context.fillText(version ? `VER ${version.code}` : `VER ${frame.placeholder}`, 44, 354);
    context.font = '600 31px sans-serif';
    context.fillText(version?.title || 'FRAME LOCKED', 44, 405);
    context.fillStyle = version?.is_open ? '#9be2ae' : '#718278';
    context.font = '21px monospace';
    context.fillText(version?.is_open ? 'OPEN / READY' : 'ARCHIVE LOCKED', 45, 445);
  };
  draw();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const cover = version?.cover_url || (version?.code === '0.1' ? '/assets/ver-0-1-cover.jpg' : '');
  if (cover) {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.addEventListener('load', () => {
      draw(image);
      texture.needsUpdate = true;
    }, { once: true });
    image.src = cover;
  }
  return texture;
};

const createCurvedFilmGeometry = ({ radius, span, height, pitch, segments = 28 }) => {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let segment = 0; segment <= segments; segment += 1) {
    const u = segment / segments;
    const angle = (u - 0.5) * span;
    const x = Math.sin(angle) * radius;
    const z = (Math.cos(angle) * radius) - radius;
    const ySlope = (angle / span) * pitch;
    positions.push(x, -height / 2 + ySlope, z, x, height / 2 + ySlope, z);
    uvs.push(u, 0, u, 1);
    if (segment === segments) continue;
    const base = segment * 2;
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const createFilmScene = (canvas, frames, onSelect) => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020403, 0.065);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40);
  camera.position.set(0, 0.08, 7.1);
  camera.lookAt(0, 0, -1.3);
  scene.add(new THREE.HemisphereLight(0xbfe3ca, 0x06100b, 1.4));
  const key = new THREE.DirectionalLight(0xdfffe8, 2.1);
  key.position.set(-4, 5, 7);
  scene.add(key);

  const filmRoot = new THREE.Group();
  scene.add(filmRoot);
  const radius = 5.15;
  const step = 0.465;
  const pitch = 0.42;
  const curvedSpan = step * 0.992;
  const frameGeometry = createCurvedFilmGeometry({ radius, span: curvedSpan, height: 1.42, pitch });
  const railGeometry = createCurvedFilmGeometry({ radius, span: curvedSpan, height: 0.15, pitch });
  const holeGeometry = new THREE.PlaneGeometry(0.09, 0.066);
  const holeMaterial = new THREE.MeshBasicMaterial({ color: 0xc2cec4, side: THREE.DoubleSide });
  const textures = [];
  const materials = new Set([holeMaterial]);
  const objects = frames.map((frame, index) => {
    const group = new THREE.Group();
    const texture = createFilmFrameTexture(frame);
    textures.push(texture);
    const pictureMaterial = new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide });
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x101713, roughness: 0.72, metalness: 0.22 });
    materials.add(pictureMaterial);
    materials.add(railMaterial);
    const picture = new THREE.Mesh(frameGeometry, pictureMaterial);
    group.add(picture);
    for (const y of [-0.785, 0.785]) {
      const rail = new THREE.Mesh(railGeometry, railMaterial);
      rail.position.set(0, y, 0.018);
      group.add(rail);
      for (let holeIndex = 0; holeIndex < 12; holeIndex += 1) {
        const hole = new THREE.Mesh(holeGeometry, holeMaterial);
        const holeAngle = ((holeIndex + 0.5) / 12 - 0.5) * curvedSpan;
        hole.position.set(
          Math.sin(holeAngle) * radius,
          y + (holeAngle / curvedSpan) * pitch,
          (Math.cos(holeAngle) * radius) - radius + 0.036,
        );
        hole.rotation.y = holeAngle;
        group.add(hole);
      }
    }
    group.userData.frameIndex = index;
    group.userData.railMaterial = railMaterial;
    group.userData.pictureMaterial = pictureMaterial;
    filmRoot.add(group);
    return group;
  });

  let selectedIndex = 0;
  const position = new THREE.Vector3();
  const targetQuaternion = new THREE.Quaternion();
  const targetScale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const wrappedOffset = (index) => {
    const half = Math.floor(frames.length / 2);
    return ((index - selectedIndex + half) % frames.length + frames.length) % frames.length - half;
  };
  const applyTargets = (instant = false) => {
    objects.forEach((object, index) => {
      const offset = wrappedOffset(index);
      const angle = offset * step;
      object.userData.targetPosition = new THREE.Vector3(
        Math.sin(angle) * radius,
        offset * pitch,
        Math.cos(angle) * radius - radius,
      );
      euler.set(0, angle, 0);
      object.userData.targetQuaternion = new THREE.Quaternion().setFromEuler(euler);
      object.userData.targetScale = new THREE.Vector3(1, 1, 1);
      object.userData.railMaterial.color.setHex(offset === 0 ? 0x315c42 : 0x101713);
      const pictureMaterial = object.userData.pictureMaterial;
      const opacity = Math.max(0.28, 1 - Math.abs(offset) * 0.13);
      const transparent = opacity < 1;
      pictureMaterial.opacity = opacity;
      pictureMaterial.depthWrite = !transparent;
      if (pictureMaterial.transparent !== transparent) {
        pictureMaterial.transparent = transparent;
        pictureMaterial.needsUpdate = true;
      }
      if (instant) {
        object.position.copy(object.userData.targetPosition);
        object.quaternion.copy(object.userData.targetQuaternion);
        object.scale.copy(object.userData.targetScale);
      }
    });
  };
  applyTargets(true);

  const setSelected = (index) => {
    selectedIndex = ((index % frames.length) + frames.length) % frames.length;
    applyTargets();
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerStart = null;
  const onPointerDown = (event) => { pointerStart = { x: event.clientX, y: event.clientY }; };
  const onPointerUp = (event) => {
    if (!pointerStart) return;
    const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    pointerStart = null;
    if (moved > 8) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(objects, true);
    if (!hits.length) return;
    let target = hits[0].object;
    while (target && !Number.isInteger(target.userData.frameIndex)) target = target.parent;
    if (target) onSelect(target.userData.frameIndex);
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);

  const resizeTarget = canvas.parentElement || canvas;
  let viewportWidth = 0;
  let viewportHeight = 0;
  const resize = () => {
    const width = Math.max(1, Math.round(resizeTarget.clientWidth || canvas.clientWidth || 1));
    const height = Math.max(1, Math.round(resizeTarget.clientHeight || canvas.clientHeight || 1));
    viewportWidth = width;
    viewportHeight = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    canvas.dataset.bufferSize = `${canvas.width}x${canvas.height}`;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(resizeTarget);
  resize();
  let animationFrame = 0;
  let lastRenderedAt = -Infinity;
  const sceneWindow = canvas.closest('.archive-workflow-window');
  const render = (time = 0) => {
    const active = !sceneWindow || sceneWindow.classList.contains('is-active');
    if (active && time - lastRenderedAt >= 32) {
      const liveWidth = Math.max(1, Math.round(resizeTarget.clientWidth || canvas.clientWidth || 1));
      const liveHeight = Math.max(1, Math.round(resizeTarget.clientHeight || canvas.clientHeight || 1));
      if (liveWidth !== viewportWidth || liveHeight !== viewportHeight) resize();
      const smoothing = reducedMotion ? 1 : 0.24;
      objects.forEach((object) => {
        position.copy(object.userData.targetPosition);
        object.position.lerp(position, smoothing);
        targetQuaternion.copy(object.userData.targetQuaternion);
        object.quaternion.slerp(targetQuaternion, smoothing);
        targetScale.copy(object.userData.targetScale);
        object.scale.lerp(targetScale, smoothing);
      });
      filmRoot.rotation.x = reducedMotion ? 0 : Math.sin(time / 3500) * 0.018;
      renderer.render(scene, camera);
      lastRenderedAt = time;
    }
    animationFrame = requestAnimationFrame(render);
  };
  render();
  canvas.dataset.helix = 'threejs-cylinder';
  canvas.dataset.frameCount = String(frames.length);

  return {
    setSelected,
    dispose() {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      frameGeometry.dispose();
      railGeometry.dispose();
      holeGeometry.dispose();
      textures.forEach((texture) => texture.dispose());
      materials.forEach((material) => material.dispose());
      renderer.dispose();
    },
  };
};

const vacancyCards = (slots, {
  action = '', actionLabel = '', enabled = true, compact = false,
} = {}) => {
  const activeSlots = slots.filter((slot) => slot.active !== false);
  if (!activeSlots.length) return '<p class="mainline-empty">管理员尚未配置人员空位。</p>';
  return activeSlots.map((slot) => `
    <article class="mainline-vacancy" data-mainline-slot="${escapeHtml(slot.id)}">
      <span class="mainline-vacancy__portrait" aria-hidden="true"><img src="${DEFAULT_PERSON_PORTRAIT}" alt="" /></span>
      <header><span>PERSONNEL SLOT</span><b>${escapeHtml(slot.position || '未命名岗位')}</b></header>
      <dl>
        <div><dt>职能</dt><dd>${escapeHtml(slot.duties || '待配置')}</dd></div>
        ${compact ? '' : `
        <div><dt>目标</dt><dd>${escapeHtml(slot.objective || '待配置')}</dd></div>
        <div><dt>地点</dt><dd>${escapeHtml(slot.location || '未配置')}</dd></div>
        <div><dt>时间</dt><dd>${escapeHtml(slot.time_label || '未配置')}</dd></div>
        <div><dt>已知材料</dt><dd>${escapeHtml(slot.known_materials || '无')}</dd></div>
        <div><dt>限制</dt><dd>${escapeHtml(slot.constraints || '无')}</dd></div>`}
      </dl>
      ${action ? `<footer><button type="button" data-mainline-action="${action}" ${enabled ? '' : 'disabled'}>${escapeHtml(actionLabel)}</button></footer>` : ''}
    </article>
  `).join('');
};

// A dossier can outlive a slot row (for example when an administrator
// recreates a role). Keep the primary slotId match, but gracefully fall back
// to the submitted role/position so existing clerk submissions remain
// discoverable instead of disappearing from the role's disclosure window.
const submissionsForSlot = (slot, submissions = []) => {
  const slotId = String(slot?.id ?? '').trim();
  const position = String(slot?.position ?? '').trim();
  return submissions.filter((record) => {
    const annotation = record?.draft_content?.mainline || {};
    if (String(annotation.slotId ?? '').trim() === slotId && slotId) return true;
    const submittedPosition = String(
      annotation.position
      ?? annotation.role
      ?? record?.draft_content?.values?.role
      ?? record?.draft_content?.values?.position
      ?? '',
    ).trim();
    return Boolean(position && submittedPosition && submittedPosition === position);
  });
};

const personnelRoster = (slots, submissions = []) => {
  const activeSlots = slots.filter((slot) => slot.active !== false);
  if (!activeSlots.length) return '<p class="mainline-empty">管理员尚未配置人员席位。</p>';
  return activeSlots.map((slot, index) => {
    const records = submissionsForSlot(slot, submissions);
    return `
      <section class="mainline-personnel-column" data-mainline-personnel-column="${escapeHtml(slot.id)}">
        <button class="mainline-personnel-seat" type="button" data-mainline-slot="${escapeHtml(slot.id)}" data-mainline-action="personnel" aria-label="编辑${escapeHtml(slot.position || '未命名岗位')}人员档案">
          <span class="mainline-personnel-seat__portrait" aria-hidden="true">
            <img src="${DEFAULT_PERSON_PORTRAIT}" alt="" /><em>${String(index + 1).padStart(2, '0')}</em>
          </span>
          <span class="mainline-personnel-seat__role">
            <b>${escapeHtml(slot.position || '未命名岗位')}</b>
            <small>${escapeHtml(slot.duties || '职能待配置')}</small>
          </span>
        </button>
        <div class="mainline-personnel-column__submissions" aria-label="${escapeHtml(slot.position || '该岗位')}已提交人员档案">
          ${records.length ? records.map((record) => {
    const submitter = record.owner?.display_name || record.submitter_name || record.owner_id || '未知书记官';
    const portrait = record.portraitUrl
      ? `<img src="${escapeHtml(record.portraitUrl)}" alt="${escapeHtml(submitter)}提交的人员头像" />`
      : `<img src="${DEFAULT_PERSON_PORTRAIT}" alt="${escapeHtml(submitter)}提交的人员头像" />`;
    return `<button type="button" class="mainline-personnel-submission" data-mainline-personnel-submission="${escapeHtml(record.id)}" data-mainline-view-personnel="${escapeHtml(record.id)}" aria-label="阅览${escapeHtml(submitter)}提交的人员档案">
              <span>${portrait}</span>
              <b>提交者：${escapeHtml(submitter)}</b>
            </button>`;
  }).join('') : '<p>尚无已提交档案</p>'}
        </div>
      </section>`;
  }).join('');
};

const briefingPersonnelCards = (slots, submissions = [], enabled = true, expandedSlots = new Set()) => {
  const activeSlots = slots.filter((slot) => slot.active !== false);
  if (!activeSlots.length) return '<p class="mainline-empty">管理员尚未配置人员空位。</p>';
  return activeSlots.map((slot) => {
    const records = submissionsForSlot(slot, submissions);
    const expanded = expandedSlots.has(slot.id);
    return `<section class="mainline-brief__personnel-column" data-mainline-personnel-column="${escapeHtml(slot.id)}">
      ${vacancyCards([slot], {
    compact: true,
    action: 'personnel',
    actionLabel: '建立人员档案',
    enabled,
  })}
      <button type="button" class="mainline-brief__personnel-toggle" data-mainline-toggle-slot-submissions="${escapeHtml(slot.id)}" aria-expanded="${expanded}" aria-label="${expanded ? '收起' : '展开'}${escapeHtml(slot.position || '该岗位')}已提交人物档案"></button>
    </section>`;
  }).join('');
};

const briefingPersonnelSubmissionWindow = (slots, submissions = [], expandedSlots = new Set()) => {
  const slotId = [...expandedSlots][0];
  const slot = slots.find((item) => item.id === slotId);
  if (!slot) return '';
  const records = submissionsForSlot(slot, submissions);
  return `<section class="mainline-brief__submission-window" data-mainline-submission-window="${escapeHtml(slot.id)}" aria-label="${escapeHtml(slot.position || '该岗位')}已提交人员档案">
    <header><b>${escapeHtml(slot.position || '该岗位')} · 已提交档案</b><span>${records.length} SUBMISSIONS</span></header>
    <div class="mainline-brief__submission-window-list">
      ${records.length ? records.map((record) => {
        const submitter = record.owner?.display_name || record.submitter_name || record.owner_id || '未知书记官';
        const portrait = record.portraitUrl
          ? `<img src="${escapeHtml(record.portraitUrl)}" alt="${escapeHtml(submitter)}提交的人员头像" />`
          : `<img src="${DEFAULT_PERSON_PORTRAIT}" alt="${escapeHtml(submitter)}提交的人员头像" />`;
        return `<button type="button" class="mainline-brief__personnel-submission" data-mainline-view-personnel="${escapeHtml(record.id)}" aria-label="阅览${escapeHtml(submitter)}提交的人员档案">
          <span>${portrait}</span><b>提交者：${escapeHtml(submitter)}</b>
        </button>`;
      }).join('') : '<p>尚无已提交档案</p>'}
    </div>
  </section>`;
};

// This is deliberately a standalone-window view. It is not mounted below the
// personnel band, so opening one role never reflows the globe or the other
// role cards.
const slotSubmissionWindowMarkup = (slot, records = []) => `
  <section class="mainline-slot-submissions" data-mainline-slot-submissions-window="${escapeHtml(slot.id)}" aria-label="${escapeHtml(slot.position || '该岗位')}已提交人物档案">
    <header>
      <div><span>PERSONNEL DOSSIERS</span><b>${escapeHtml(slot.position || '未命名岗位')}</b></div>
      <em>${records.length} SUBMISSIONS</em>
    </header>
    <p class="mainline-slot-submissions__hint">已提交人物档案</p>
    <div class="mainline-slot-submissions__list">
      ${records.length ? records.map((record) => {
    const submitter = record.owner?.display_name || record.submitter_name || record.owner_id || '未知书记官';
    const portrait = record.portraitUrl
      ? `<img src="${escapeHtml(record.portraitUrl)}" alt="${escapeHtml(submitter)}提交的人物头像" />`
      : `<img src="${DEFAULT_PERSON_PORTRAIT}" alt="${escapeHtml(submitter)}提交的人物头像" />`;
    return `<button type="button" data-mainline-view-personnel="${escapeHtml(record.id)}" aria-label="阅览${escapeHtml(submitter)}提交的人物档案">
          <span>${portrait}</span><small>提交者：${escapeHtml(submitter)}</small>
        </button>`;
  }).join('') : '<p class="mainline-slot-submissions__empty">该岗位暂未收到书记官提交的人物档案。</p>'}
    </div>
  </section>
`;

const adminMarkup = (current, slots, selectedPart) => {
  const workflow = normalizeVersionBriefing(current);
  const briefing = workflow.parts[String(selectedPart)];
  const isCurrent = workflow.activePart === selectedPart;
  const editableSlots = slots.map((slot) => `
    <details class="mainline-admin__slot">
      <summary>${escapeHtml(slot.position || '未命名岗位')} · ${slot.active === false ? '已关闭' : '开放'}</summary>
      <form data-mainline-slot-edit-form>
        <input type="hidden" name="id" value="${escapeHtml(slot.id)}" />
        <label>岗位<input name="position" value="${escapeHtml(slot.position)}" required /></label>
        <label>职能<input name="duties" value="${escapeHtml(slot.duties)}" /></label>
        <label>空位状态<select name="active"><option value="true" ${slot.active !== false ? 'selected' : ''}>开放</option><option value="false" ${slot.active === false ? 'selected' : ''}>关闭</option></select></label>
        <button type="submit">保存空位</button>
      </form>
    </details>
  `).join('');
  return `
    <details class="mainline-admin" data-mainline-admin-panel>
      <summary>管理员配置</summary>
      <form data-mainline-version-form>
        <fieldset data-mainline-admin-section="version"><legend>版本状态</legend>
          <label>版本号<input name="code" value="${escapeHtml(current.code)}" required /></label>
          <label>版本标题<input name="title" value="${escapeHtml(current.title)}" required /></label>
          <label>开放状态<select name="isOpen"><option value="true" ${current.is_open ? 'selected' : ''}>开放</option><option value="false" ${!current.is_open ? 'selected' : ''}>关闭</option></select></label>
        </fieldset>
        <fieldset data-mainline-admin-section="briefing"><legend>PART ${String(selectedPart).padStart(2, '0')} · 独立任务配置</legend>
          <label>任务状态<select name="partStatus"><option value="locked" ${briefing.status === 'locked' ? 'selected' : ''}>未开放</option><option value="open" ${briefing.status === 'open' ? 'selected' : ''}>进行中</option><option value="complete" ${briefing.status === 'complete' ? 'selected' : ''}>管理员确认完成</option></select></label>
          <label>开放至阶段<select name="activeStage">${[0, 1, 2, 3].map((stage) => `<option value="${stage}" ${briefing.activeStage === stage ? 'selected' : ''}>${escapeHtml(stageLabel(stage))}</option>`).join('')}</select></label>
          <label class="mainline-admin__current"><input type="checkbox" name="isCurrent" value="true" ${isCurrent ? 'checked' : ''} />设为版本当前任务</label>
          <label class="is-wide">概要<textarea name="summary">${escapeHtml(briefing.summary)}</textarea></label>
          <label>行动目标<input name="objective" value="${escapeHtml(briefing.objective)}" /></label>
          <label>关联站点<select name="stationCode"><option value="">按地点文字自动匹配</option>${stationOptionsMarkup(briefing.stationCode)}</select></label>
          <label>地点<input name="location" value="${escapeHtml(briefing.location)}" /></label>
          <label>时间<input name="time" value="${escapeHtml(briefing.time)}" /></label>
          <label>已知材料<textarea name="knownMaterials">${escapeHtml(briefing.knownMaterials)}</textarea></label>
          <label class="is-wide">限制<textarea name="constraints">${escapeHtml(briefing.constraints)}</textarea></label>
        </fieldset>
        <button type="submit">保存 PART ${String(selectedPart).padStart(2, '0')} 配置</button>
      </form>
      <form data-mainline-cover-form>
        <label>版本封面<input name="cover" type="file" accept="image/*" required /></label>
        <button type="submit">上传封面</button>
      </form>
      <details class="mainline-admin__slots" data-mainline-admin-section="slots" open>
        <summary>人员空位 · ${slots.length}</summary>
        ${editableSlots || '<p class="mainline-empty">尚无空位。</p>'}
        <form data-mainline-slot-form>
          <label>岗位<input name="position" required /></label>
          <label>职能<input name="duties" /></label>
          <button type="submit">新增人员空位</button>
        </form>
      </details>
    </details>
  `;
};

export const openMainlineWindow = async ({ createWindow, role, client, openTemplate }) => {
  let versions = defaultVersions();
  let mainlineServerIssue = '';

  const loadVersions = async () => {
    try {
      const loaded = typeof client?.listMainlineVersions === 'function'
        ? await client.listMainlineVersions()
        : defaultVersions();
      versions = visibleMainlineVersions(loaded.length ? loaded : defaultVersions(), role);
      mainlineServerIssue = '';
    } catch (error) {
      // A missing migration must not turn the entrance computer into a dead
      // screen. The selector can still show VER 0.1, while clearly marking
      // that configuration and cross-user data are not yet available.
      versions = visibleMainlineVersions(defaultVersions(), role);
      mainlineServerIssue = error?.message || '主线服务器配置尚未就绪';
    }
    if (!versions.length) versions = defaultVersions();
    return versions;
  };

  const loadVersionAndSlots = async (version) => {
    const nextVersions = await loadVersions();
    const current = nextVersions.find(({ code }) => code === version.code) || version;
    let slots = [];
    try {
      slots = typeof client?.listMainlineStaffSlots === 'function'
        ? await client.listMainlineStaffSlots(current.code)
        : [];
    } catch (error) {
      mainlineServerIssue = error?.message || '人员席位服务器配置尚未就绪';
    }
    return { current, slots };
  };

  const loadPersonnelSubmissions = async (versionCode, part) => {
    if (typeof client?.listMainlinePersonnelSubmissions !== 'function') return [];
    const records = (await client.listMainlinePersonnelSubmissions(versionCode)).filter((record) =>
      Number(record.draft_content?.mainline?.part || 1) === Number(part || 1));
    if (typeof client?.listContributionMedia !== 'function') return records;
    return Promise.all(records.map(async (record) => {
      try {
        const media = await client.listContributionMedia(record.id);
        const portrait = media.find((entry) => entry.role === 'portrait' || entry.field === 'photo');
        return { ...record, media, portraitUrl: portrait?.publicUrl || portrait?.dataUrl || '' };
      } catch {
        return record;
      }
    }));
  };

  const openPersonnelViewer = (record, returnFocus = null) => {
    const annotation = record.draft_content?.mainline || {};
    const submitter = record.owner || {
      id: record.owner_id || 'unknown',
      display_name: record.submitter_name || '未知书记官',
    };
    const state = createWindow({
      key: `mainline-personnel-view-${record.id}`,
      title: record.title || '人员档案阅览',
      code: 'PER.VIEW',
      className: 'mainline-personnel-viewer-window',
      icon: MAINLINE_ICON,
      body: '<section class="mainline-personnel-viewer" data-mainline-personnel-viewer></section>',
      returnFocus,
    });
    if (state.mainlinePersonnelViewerReady) return state;
    state.mainlinePersonnelViewerReady = true;
    const submittedMedia = record.media?.length ? record.media : (record.draft_content?.media || []);
    const hasPortrait = submittedMedia.some((entry) => entry.role === 'portrait' || entry.field === 'photo');
    const content = {
      ...record.draft_content,
      media: hasPortrait ? submittedMedia : [{ role: 'portrait', publicUrl: DEFAULT_PERSON_PORTRAIT }, ...submittedMedia],
    };
    state.windowElement.querySelector('[data-mainline-personnel-viewer]').innerHTML = `
      <header><b>只读人员档案</b><span>VER ${escapeHtml(annotation.versionCode || '0.1')} · PART ${String(annotation.part || 1).padStart(2, '0')} · 提交者：${escapeHtml(submitter.display_name)}</span></header>
      <div>${renderFormalArchiveDocument({
    archive: {
      id: record.archive_id || null,
      code: '',
      title: record.title || '人员档案',
      category: 'person',
      abbreviation: 'PER',
      origin: 'community',
    },
    contribution: { ...record, owner: submitter, versions: [] },
    version: {
      version_label: '0.1',
      content,
      submitter,
      modifier: null,
      reviewer: null,
      approved_at: record.submitted_at || record.updated_at,
    },
    preview: true,
  })}</div>`;
    return state;
  };

  const openSlotSubmissionsWindow = ({
    slotId,
    slots: availableSlots = [],
    submissions = [],
    returnFocus = null,
  } = {}) => {
    // This helper lives at the mainline-program scope, while the current
    // part's slots and submissions live inside the briefing window.  Pass
    // those collections explicitly; otherwise clicking a dossier corner
    // throws before the small window can be created.
    const slot = availableSlots.find((item) => item.id === slotId);
    if (!slot) return null;
    const records = submissionsForSlot(slot, submissions);
    const state = createWindow({
      key: `mainline-slot-submissions-${slot.id}`,
      title: `${slot.position || '人员岗位'} / 已提交档案`,
      code: 'DOSSIER',
      className: 'mainline-submissions-window',
      icon: MAINLINE_ICON,
      body: '<section data-mainline-submission-window-shell></section>',
      returnFocus,
    });
    // Refresh every time: newly submitted material becomes visible without
    // closing a previously opened dossier window.
    state.mainlineSubmissionRecords = records;
    state.windowElement.querySelector('[data-mainline-submission-window-shell]').innerHTML = slotSubmissionWindowMarkup(slot, records);
    if (!state.mainlineSubmissionWindowReady) {
      state.mainlineSubmissionWindowReady = true;
      state.windowElement.addEventListener('click', (event) => {
        const recordId = event.target.closest('[data-mainline-view-personnel]')?.dataset.mainlineViewPersonnel;
        const record = state.mainlineSubmissionRecords?.find((item) => item.id === recordId);
        if (record) openPersonnelViewer(record, event.target.closest('[data-mainline-view-personnel]'));
      });
    }
    state.windowElement.focus({ preventScroll: true });
    return state;
  };

  const openPersonnel = (current, slot, part) => {
    const fields = partBriefing(current, part);
    return openTemplate('06', {
    title: '',
    mainlineBriefing: briefingText(fields),
    content: annotateMainlineDocument({
      values: {
        role: slot.position || '',
        roleRelation: slot.duties || '',
      },
    }, {
      versionCode: current.code, part,
      stage: 1, slotId: slot.id, kind: 'personnel',
    }),
  });
  };

  const openExperience = (current, slot, part) => {
    const fields = partBriefing(current, part);
    return openTemplate('07', {
    title: `VER ${current.code} / 事件经历`,
    mainlineExperience: true,
    mainlineBriefing: briefingText(fields),
    content: annotateMainlineDocument({
      values: {
        experienceLocation: fields.location || slot.location || '',
        experienceTime: fields.time || slot.time_label || '',
      },
    }, {
      versionCode: current.code, part,
      stage: 2, slotId: slot.id, kind: 'experience',
    }),
  });
  };

  const compileFormalEvent = async (current, part, setStatus) => {
    if (typeof client?.listReviewQueue !== 'function') {
      setStatus('当前连接无法读取待审核材料。');
      return;
    }
    setStatus('正在汇集事件经历材料…');
    const records = await client.listReviewQueue();
    const materials = records.filter((record) => record.template_id === '07'
      && record.draft_content?.mainline?.versionCode === current.code
      && Number(record.draft_content?.mainline?.part || 1) === Number(part)
      && record.draft_content?.mainline?.kind === 'experience');
    if (!materials.length) {
      setStatus('尚无已提交的事件经历材料。');
      return;
    }
    const narrative = materials.map((record, index) => {
      const values = record.draft_content?.values || {};
      return `【材料 ${index + 1} / ${record.owner?.display_name || record.title}】\n${values.experienceNarrative || values.missionContent || '未填写经历正文'}`;
    }).join('\n\n');
    openTemplate('07', {
      title: `VER ${current.code} / ${current.title}`,
      mainlineBriefing: `已汇入 ${materials.length} 份既有事件经历材料；请在原有事件档案表单中整理并按既有审核流程提交。`,
      content: annotateMainlineDocument({ values: { missionContent: narrative } }, {
        versionCode: current.code, part,
        stage: 3, kind: 'formal-event',
      }),
    });
    setStatus(`已汇集 ${materials.length} 份材料`);
  };

  const openStageWindow = async (version, stage, part, returnFocus = null) => {
    const selectedPart = clampPart(part);
    const state = createWindow({
      key: `mainline-stage-${stage}-${version.code.replaceAll('.', '-')}-part-${selectedPart}`,
      title: `VER ${version.code} · PART ${String(selectedPart).padStart(2, '0')} · 阶段 ${stage}`,
      code: `STAGE${stage}.EXE`,
      className: 'mainline-stage-window',
      icon: MAINLINE_ICON,
      body: stageWindowMarkup(stage),
      returnFocus,
    });
    if (state.mainlineStageReady) {
      await state.reloadMainline?.();
      return state;
    }
    state.mainlineStageReady = true;
    const root = state.windowElement.querySelector('[data-mainline-stage]');
    const status = root.querySelector('[data-mainline-stage-status]');
    const content = root.querySelector('[data-mainline-stage-content]');
    let current = version;
    let slots = [];
    let personnelSubmissions = [];
    const setStatus = (message) => { status.textContent = message; };

    const render = () => {
      const open = mainlineStageIsOpen(current, stage, selectedPart);
      const partState = mainlinePartState(current, selectedPart);
      root.dataset.stageOpen = String(open);
      setStatus(open
        ? `VER ${current.code} · PART ${String(selectedPart).padStart(2, '0')} · ${partState.status === 'complete' ? '管理员已确认完成' : '已开放'}`
        : `VER ${current.code} · PART ${String(selectedPart).padStart(2, '0')} · 尚未开放`);
      if (!open) {
        content.innerHTML = '<p class="mainline-stage__locked">此阶段尚未由管理员开放。</p>';
        return;
      }
      if (stage === 1) {
        content.innerHTML = `<section class="mainline-personnel-roster" aria-label="行动人员席位与已提交人员档案">${personnelRoster(slots, personnelSubmissions)}</section>`;
      } else if (stage === 2) {
        content.innerHTML = `<section class="mainline-stage__grid">${vacancyCards(slots, { action: 'experience', actionLabel: '打开事件经历记录表单' })}</section>`;
      } else {
        content.innerHTML = role === 'admin'
          ? '<section class="mainline-stage__compile"><b>正式事件汇编</b><p>从既有审核队列读取本版本的事件经历材料，并送入既有正式事件表单。不会创建新的草稿、审核或归档机制。</p><button type="button" data-mainline-action="formal-event">汇入既有正式事件表单</button></section>'
          : '<p class="mainline-stage__locked">本阶段由管理员执行材料汇编与正式归档。</p>';
      }
    };

    const reload = async () => {
      try {
        ({ current, slots } = await loadVersionAndSlots(version));
        personnelSubmissions = stage === 1
          ? await loadPersonnelSubmissions(current.code, selectedPart)
          : [];
        render();
      } catch (error) {
        content.innerHTML = `<p class="mainline-stage__locked">${escapeHtml(error.message || '阶段数据读取失败')}</p>`;
        setStatus('读取失败');
      }
    };
    state.reloadMainline = reload;
    const onSubmissionChanged = (event) => {
      if (stage === 1 && event.detail?.templateId === '06') void reload();
    };
    window.addEventListener('palis:archive-submission-changed', onSubmissionChanged);
    const unsubscribeMainline = subscribeToMainlineChanges(client, reload);
    state.dispose = () => {
      unsubscribeMainline();
      window.removeEventListener('palis:archive-submission-changed', onSubmissionChanged);
    };
    root.addEventListener('click', async (event) => {
      const submissionId = event.target.closest('[data-mainline-view-personnel]')?.dataset.mainlineViewPersonnel;
      const submission = personnelSubmissions.find((record) => record.id === submissionId);
      if (submission) {
        openPersonnelViewer(submission, event.target.closest('[data-mainline-view-personnel]'));
        return;
      }
      const action = event.target.closest('[data-mainline-action]')?.dataset.mainlineAction;
      const slotId = event.target.closest('[data-mainline-slot]')?.dataset.mainlineSlot;
      const slot = slots.find(({ id }) => id === slotId);
      if (action === 'personnel' && slot) openPersonnel(current, slot, selectedPart);
      if (action === 'experience' && slot) openExperience(current, slot, selectedPart);
      if (action === 'formal-event' && role === 'admin') await compileFormalEvent(current, selectedPart, setStatus);
    });
    await reload();
    return state;
  };

  const openBriefingWindow = async (version, returnFocus = null) => {
    const state = createWindow({
      key: `mainline-briefing-${version.code.replaceAll('.', '-')}`,
      title: `VER ${version.code} / ${version.title}`,
      code: 'BRIEFING.EXE',
      className: 'mainline-brief-window',
      icon: MAINLINE_ICON,
      body: briefingWindowMarkup(),
      returnFocus,
    });
    if (state.mainlineBriefReady) {
      await state.reloadMainline?.();
      return state;
    }
    state.mainlineBriefReady = true;
    const root = state.windowElement.querySelector('[data-mainline-brief]');
    const heading = root.querySelector('[data-mainline-version-heading]');
    const status = root.querySelector('[data-mainline-status]');
    const stageFocus = root.querySelector('[data-mainline-stage-focus]');
    const briefing = root.querySelector('[data-mainline-briefing]');
    const partProgress = root.querySelector('[data-mainline-part-progress]');
    const stageEntries = root.querySelector('[data-mainline-stage-entries]');
    const slotOverview = root.querySelector('[data-mainline-slot-overview]');
    const admin = root.querySelector('[data-mainline-admin]');
    const hero = root.querySelector('[data-mainline-hero]');
    const stationCanvas = root.querySelector('[data-mainline-station-canvas]');
    const stationLabel = root.querySelector('[data-mainline-station-label]');
    const missionGlobe = createMissionGlobe(stationCanvas);
    let current = version;
    let slots = [];
    let personnelSubmissions = [];
    const expandedSubmissionSlots = new Set();
    let selectedPart = normalizeVersionBriefing(version).activePart;
    const setStatus = (message) => { status.textContent = message; };

    const render = () => {
      const workflow = normalizeVersionBriefing(current);
      const fields = workflow.parts[String(selectedPart)];
      const official = workflow.parts[String(workflow.activePart)];
      const focusStage = Math.min(3, Math.max(1, Number(fields.activeStage) || 1));
      const focusOpen = mainlineStageIsOpen(current, focusStage, selectedPart);
      const focusTask = stageTask(focusStage, role);
      const partIsLocked = fields.status === 'locked';
      const missionStation = resolveMissionStation(fields, selectedPart);
      heading.innerHTML = `<b>VER ${escapeHtml(current.code)}《${escapeHtml(current.title)}》</b><span>当前任务：PART ${String(workflow.activePart).padStart(2, '0')} · ${escapeHtml(stageLabel(official.activeStage))}</span>`;
      hero.innerHTML = `<span>${escapeHtml(stageLabel(focusStage).split('/')[0].trim())}</span><h1>${escapeHtml(focusTask.title)}</h1><small>PART ${String(selectedPart).padStart(2, '0')} · ARCHIVE CORRECTION MISSION</small>`;
      missionGlobe.setStation(missionStation);
      stationLabel.innerHTML = `<i aria-hidden="true"></i><span><b>${escapeHtml(missionStation.name)}</b><small>${escapeHtml(missionStation.code)} · ${escapeHtml(missionStation.english)}</small><em>${Number(missionStation.lat).toFixed(2)}° / ${Number(missionStation.lng).toFixed(2)}°</em></span>`;
      stageFocus.dataset.stage = String(focusStage);
      stageFocus.dataset.open = String(focusOpen && !partIsLocked);
      stageFocus.innerHTML = `
        <header><b>当前修正</b><span>›</span></header>
        <div class="mainline-brief__focus-index" aria-hidden="true">0${focusStage}</div>
        <div class="mainline-brief__focus-copy">
          <span>CURRENT ASSIGNMENT / PART ${String(selectedPart).padStart(2, '0')}</span>
          <h2>${escapeHtml(focusTask.title)}</h2>
          <p>${escapeHtml(partIsLocked ? '当前 PART 尚未由管理员开放。' : focusTask.prompt)}</p>
          <small>${escapeHtml(partIsLocked ? '请等待管理员发布行动简报。' : focusTask.support)}</small>
        </div>
        <div class="mainline-brief__focus-action">
          <b>${partIsLocked ? '尚未开放' : fields.status === 'complete' ? '管理员已确认完成' : `进行中 · 阶段 ${focusStage} / 3`}</b>
          ${role === 'admin'
            ? `<div class="mainline-brief__focus-admin" aria-label="管理员快捷操作">
                <span>ADMIN CONTROL</span>
                <button type="button" data-mainline-admin-jump="briefing">编辑任务简报</button>
                <button type="button" data-mainline-admin-jump="progress">调整开放进度</button>
                <button type="button" data-mainline-admin-jump="slots">管理人员空位</button>
              </div>`
            : focusTask.action && focusOpen && !partIsLocked
            ? `<button type="button" data-mainline-focus-stage="${focusStage}">${escapeHtml(focusTask.action)}</button>`
            : '<span>当前没有可执行操作</span>'}
        </div>`;
      partProgress.innerHTML = `<header><b>行动进度</b><span>VERSION TASK PROGRESS</span></header><ol>${[1, 2, 3, 4, 5, 6, 7].map((part) => {
        const partFields = workflow.parts[String(part)];
        const state = partFields.status === 'complete'
          ? 'is-complete'
          : partFields.status === 'locked'
            ? 'is-locked'
            : part === workflow.activePart ? 'is-current' : 'is-open';
        const stateLabel = partFields.status === 'complete'
          ? '管理员已确认'
          : partFields.status === 'locked'
            ? '尚未开放'
            : part === workflow.activePart ? '当前任务' : '已开放';
        const content = `<span>${String(part).padStart(2, '0')}</span><b>PART ${String(part).padStart(2, '0')}</b><small>${stateLabel}</small>`;
        const selectable = role === 'admin' || partFields.status !== 'locked';
        return `<li class="${state} ${part === selectedPart ? 'is-selected' : ''}" ${part === workflow.activePart ? 'aria-current="step"' : ''}>${selectable ? `<button type="button" data-mainline-select-part="${part}" aria-label="查看 PART ${String(part).padStart(2, '0')} 独立配置">${content}</button>` : content}</li>`;
      }).join('')}</ol>`;
      briefing.innerHTML = `
        <header><div><span>核心事件 / PRIMARY DOSSIER</span><em>CLASSIFIED // LEVEL ${focusStage}</em></div><b>PART ${String(selectedPart).padStart(2, '0')}</b></header>
        <p class="mainline-brief__case-year">${escapeHtml(fields.time || '1952')}</p>
        <h2>${escapeHtml(fields.summary || '管理员尚未发布任务概要。').replaceAll('\n', '<br />')}</h2>
        <p class="mainline-brief__summary">${escapeHtml(fields.objective || `${missionStation.name}行动档案`)}</p>
        <dl>
          <div><dt>行动站点</dt><dd>${escapeHtml(missionStation.name)}</dd></div>
          <div><dt>地点</dt><dd>${escapeHtml(fields.location || missionStation.english)}</dd></div>
          <div><dt>已知材料</dt><dd>${escapeHtml(fields.knownMaterials || '无')}</dd></div>
          <div><dt>限制</dt><dd>${escapeHtml(fields.constraints || '无')}</dd></div>
        </dl><footer><button type="button" data-mainline-focus-stage="${focusStage}" ${focusOpen && !partIsLocked ? '' : 'disabled'}>查看当前阶段档案 <span>→</span></button><em>PALIS ARCHIVE</em></footer>`;
      stageEntries.innerHTML = `<header><b>阶段入口</b><span>STAGE ACCESS</span></header><ol>${[1, 2, 3].map((stage) => {
        const open = mainlineStageIsOpen(current, stage, selectedPart);
        const isCurrent = stage === focusStage;
        const flowState = isCurrent
          ? (open && !partIsLocked ? '当前进行 · 点击进入' : '等待管理员开放')
          : stage < focusStage
            ? '此前阶段 · 可查阅'
            : `等待阶段 ${focusStage} 完成`;
        return `<li class="${isCurrent ? 'is-current' : ''} ${open ? 'is-open' : 'is-locked'}">
          <button type="button" data-mainline-open-stage="${stage}" ${open ? '' : 'disabled'}>
            <span>0${stage}</span><b>${escapeHtml(stageLabel(stage))}</b><small>${escapeHtml(flowState)}</small>
          </button>
        </li>`;
      }).join('')}</ol>`;
      const activeSlots = slots.filter((slot) => slot.active !== false);
      slotOverview.innerHTML = `<header><b>${focusStage === 1 ? '行动人员空位' : '行动人员档案'}</b><span>${activeSlots.length} PERSONNEL DOSSIERS · ${personnelSubmissions.length} SUBMISSIONS</span></header><div class="mainline-brief__vacancy-grid">${briefingPersonnelCards(activeSlots, personnelSubmissions, focusOpen && !partIsLocked, expandedSubmissionSlots)}</div>`;
      // Bind each corner disclosure directly after every render. Delegation
      // remains below as a fallback, while this listener keeps the tiny
      // control reliable when the atlas canvas is visually adjacent to it.
      slotOverview.querySelectorAll('[data-mainline-toggle-slot-submissions]').forEach((toggle) => {
        let openedByPointer = false;
        const openSubmittedDossiers = (event) => {
          event.preventDefault();
          event.stopPropagation();
          const slotId = toggle.dataset.mainlineToggleSlotSubmissions;
          const opened = openSlotSubmissionsWindow({
            slotId,
            slots,
            submissions: personnelSubmissions,
            returnFocus: toggle,
          });
          setStatus(opened
            ? '宸叉墦寮€璇ュ矖浣嶇殑鐙珛鎻愪氦妗ｆ绐楀彛'
            : '鏈壘鍒拌浜哄憳绌轰綅锛岃鑱旂郴绠＄悊鍛樿ˉ鍏呭矖浣嶄俊鎭紒');
        };
        // Open on press rather than waiting for click. The briefing has a
        // draggable desktop window and a WebGL atlas beside this control;
        // opening here makes the tiny corner reliably actionable on mouse,
        // touch, and pen input.
        toggle.addEventListener('pointerdown', (event) => {
          if (event.button !== 0) return;
          openedByPointer = true;
          openSubmittedDossiers(event);
        });
        toggle.addEventListener('click', (event) => {
          if (openedByPointer) {
            openedByPointer = false;
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          openSubmittedDossiers(event);
        });
      });
      admin.innerHTML = role === 'admin' ? adminMarkup(current, slots, selectedPart) : '';
    };

    const reload = async () => {
      try {
        ({ current, slots } = await loadVersionAndSlots(version));
        personnelSubmissions = await loadPersonnelSubmissions(current.code, selectedPart);
        render();
        setStatus(`VER ${current.code} 已就绪`);
      } catch (error) {
        render();
        setStatus(error.message || '主线配置读取失败');
      }
    };
    const unsubscribeMainline = subscribeToMainlineChanges(client, reload);
    const onSubmissionChanged = (event) => {
      if (event.detail?.templateId === '06') void reload();
    };
    window.addEventListener('palis:archive-submission-changed', onSubmissionChanged);
    state.dispose = () => {
      unsubscribeMainline();
      window.removeEventListener('palis:archive-submission-changed', onSubmissionChanged);
      missionGlobe.dispose();
    };
    state.reloadMainline = reload;

    root.addEventListener('click', async (event) => {
      const partButton = event.target.closest('[data-mainline-select-part]');
      if (partButton) {
        selectedPart = clampPart(partButton.dataset.mainlineSelectPart);
        expandedSubmissionSlots.clear();
        setStatus(`正在查看 PART ${String(selectedPart).padStart(2, '0')} 的独立任务配置`);
        await reload();
        return;
      }
      const adminJump = event.target.closest('[data-mainline-admin-jump]');
      if (adminJump) {
        const destination = adminJump.dataset.mainlineAdminJump;
        const panel = admin.querySelector('[data-mainline-admin-panel]');
        const section = destination === 'slots'
          ? admin.querySelector('[data-mainline-admin-section="slots"]')
          : admin.querySelector('[data-mainline-admin-section="briefing"]');
        if (panel) panel.open = true;
        if (section?.tagName === 'DETAILS') section.open = true;
        section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const focusTarget = destination === 'progress'
          ? section?.querySelector('select[name="activeStage"]')
          : destination === 'slots'
            ? section?.querySelector('input[name="position"]')
            : section?.querySelector('textarea[name="summary"]');
        focusTarget?.focus({ preventScroll: true });
        setStatus(destination === 'slots' ? '已打开人员空位管理' : destination === 'progress' ? '已打开任务开放进度' : '已打开当前 PART 简报编辑');
        return;
      }
      const submissionsToggle = event.target.closest('[data-mainline-toggle-slot-submissions]');
      if (submissionsToggle) {
        const slotId = submissionsToggle.dataset.mainlineToggleSlotSubmissions;
        openSlotSubmissionsWindow({
          slotId,
          slots,
          submissions: personnelSubmissions,
          returnFocus: submissionsToggle,
        });
        setStatus('已打开该岗位的独立提交档案窗口');
        return;
      }
      const button = event.target.closest('[data-mainline-open-stage], [data-mainline-focus-stage]');
      if (button && !button.disabled) {
        const stage = Number(button.dataset.mainlineOpenStage || button.dataset.mainlineFocusStage);
        void openStageWindow(current, stage, selectedPart, button);
        return;
      }
      const submissionId = event.target.closest('[data-mainline-view-personnel]')?.dataset.mainlineViewPersonnel;
      const submission = personnelSubmissions.find((record) => record.id === submissionId);
      if (submission) {
        openPersonnelViewer(submission, event.target.closest('[data-mainline-view-personnel]'));
        return;
      }
      const personnelButton = event.target.closest('[data-mainline-action="personnel"]');
      if (!personnelButton || personnelButton.disabled) return;
      const slotId = personnelButton.closest('[data-mainline-slot]')?.dataset.mainlineSlot;
      const slot = slots.find((item) => item.id === slotId);
      if (slot) openPersonnel(current, slot, selectedPart);
    });

    root.addEventListener('submit', async (event) => {
      const form = event.target;
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      if (submit) submit.disabled = true;
      try {
        if (form.matches('[data-mainline-version-form]') && client?.saveMainlineVersion) {
          const data = new FormData(form);
          const workflow = normalizeVersionBriefing(current);
          const nextStatus = String(data.get('partStatus') || 'locked');
          const wantsCurrent = data.get('isCurrent') === 'true';
          if (wantsCurrent && nextStatus === 'locked') throw new Error('当前任务不能设为“未开放”。');
          if (workflow.activePart === selectedPart && nextStatus === 'locked') throw new Error('请先将另一个已开放 PART 设为当前任务。');
          workflow.parts[String(selectedPart)] = {
            ...workflow.parts[String(selectedPart)],
            ...normalizePartBriefing({
              summary: data.get('summary'),
              objective: data.get('objective'),
              location: data.get('location'),
              stationCode: data.get('stationCode'),
              time: data.get('time'),
              knownMaterials: data.get('knownMaterials'),
              constraints: data.get('constraints'),
            }),
            status: nextStatus,
            activeStage: nextStatus === 'locked' ? 0 : Math.min(3, Math.max(0, Number(data.get('activeStage')) || 0)),
          };
          if (wantsCurrent) workflow.activePart = selectedPart;
          const activeFields = workflow.parts[String(workflow.activePart)];
          current = await client.saveMainlineVersion({
            code: data.get('code'),
            title: data.get('title'),
            isOpen: data.get('isOpen') === 'true',
            activeStage: activeFields.activeStage,
            briefing: serializeVersionBriefing(current, workflow),
          });
        }
        if (form.matches('[data-mainline-cover-form]') && client?.uploadMainlineCover) {
          await client.uploadMainlineCover(current.code, form.elements.cover.files[0]);
        }
        if ((form.matches('[data-mainline-slot-form]') || form.matches('[data-mainline-slot-edit-form]')) && client?.saveMainlineStaffSlot) {
          const values = Object.fromEntries(new FormData(form));
          const existing = slots.find((slot) => slot.id === values.id);
          await client.saveMainlineStaffSlot({
            versionCode: current.code,
            objective: existing?.objective || '',
            location: existing?.location || '',
            timeLabel: existing?.time_label || '',
            knownMaterials: existing?.known_materials || '',
            constraints: existing?.constraints || '',
            ...values,
            active: values.active !== 'false',
          });
          if (form.matches('[data-mainline-slot-form]')) form.reset();
        }
        await reload();
        setStatus('配置已保存');
      } catch (error) {
        setStatus(error.message || '保存失败');
      } finally {
        if (submit?.isConnected) submit.disabled = false;
      }
    });

    await reload();
    return state;
  };

  const openFilmstrip = async (returnFocus = null) => {
    await loadVersions();
    const state = createWindow({
      key: 'mainline-filmstrip',
      title: '版本选择器',
      code: 'SELECTOR',
      className: 'mainline-film-window',
      icon: MAINLINE_ICON,
      body: filmMarkup(),
      returnFocus,
    });
    if (state.mainlineFilmReady) return state;
    state.mainlineFilmReady = true;
    const root = state.windowElement.querySelector('[data-mainline-film]');
    const helix = document.createElement('div');
    const canvas = root.querySelector('[data-mainline-film-canvas]');
    const accessible = root.querySelector('[data-mainline-film-accessible]');
    const status = root.querySelector('[data-mainline-film-status]');
    let frames = futureFilmFrames(versions);
    let selectedIndex = 0;
    let filmScene = null;
    const openSelected = () => {
      const selected = frames[selectedIndex]?.version;
      if (selected) void openBriefingWindow(selected, canvas);
    };
    filmScene = createFilmScene(canvas, frames, (index) => {
      if (index === selectedIndex && frames[index]?.version) openSelected();
      else {
        selectedIndex = index;
        render();
      }
    });
    state.dispose = () => filmScene.dispose();

    const render = () => {
      helix.innerHTML = frames.map((frame, index) => {
        const offset = index - selectedIndex;
        const half = Math.floor(frames.length / 2);
        const wrappedOffset = ((offset + half) % frames.length + frames.length) % frames.length - half;
        const depth = Math.abs(wrappedOffset);
        const angle = wrappedOffset * 24;
        const y = Math.sin(wrappedOffset * 0.82) * 42 + wrappedOffset * 7;
        const version = frame.version;
        const cover = version?.cover_url || (version?.code === '0.1' ? '/assets/ver-0-1-cover.jpg' : '');
        const stateCopy = version ? (version.is_open ? '开放' : '管理员预览 · 已关闭') : '未开放';
        return `<button type="button" class="mainline-film__frame ${version ? 'is-version' : 'is-locked'} ${wrappedOffset === 0 ? 'is-selected' : ''}" style="--film-angle:${angle}deg;--film-y:${y}px;--film-opacity:${Math.max(0.2, 1 - depth * 0.14)};--film-depth:${frames.length - depth}" data-mainline-frame-index="${index}" ${version ? `data-mainline-version="${escapeHtml(version.code)}"` : 'aria-disabled="true"'} aria-pressed="${wrappedOffset === 0}"><i aria-hidden="true"></i><span>${cover ? `<img src="${escapeHtml(cover)}" alt="VER ${escapeHtml(version?.code)} 版本封面" />` : '<em>FRAME LOCKED</em>'}</span><b>${version ? `VER ${escapeHtml(version.code)}` : `VER ${escapeHtml(frame.placeholder)}`}</b><small>${escapeHtml(version?.title || stateCopy)}</small><em>${escapeHtml(stateCopy)}</em></button>`;
      }).join('');
      const selected = frames[selectedIndex]?.version;
      status.textContent = selected
        ? `VER ${selected.code} / ${selected.title} / ${selected.is_open ? '开放' : '关闭'}`
        : `${frames[selectedIndex]?.placeholder || '未来版本'} / 未开放`;
      if (mainlineServerIssue) status.textContent += ' / 服务器主线配置待迁移';
      filmScene.setSelected(selectedIndex);
      accessible.innerHTML = frames.map((frame, index) => `<button type="button" data-mainline-frame-index="${index}" ${frame.version ? `data-mainline-version="${escapeHtml(frame.version.code)}"` : 'disabled'} aria-pressed="${index === selectedIndex}">${frame.version ? `VER ${escapeHtml(frame.version.code)} ${escapeHtml(frame.version.title)}` : `VER ${escapeHtml(frame.placeholder)} 未开放`}</button>`).join('');
    };

    const move = (delta) => {
      selectedIndex = ((selectedIndex + delta) % frames.length + frames.length) % frames.length;
      render();
    };
    const reloadVersions = async () => {
      const selectedCode = frames[selectedIndex]?.version?.code;
      await loadVersions();
      frames = futureFilmFrames(versions);
      const nextIndex = frames.findIndex((frame) => frame.version?.code === selectedCode);
      selectedIndex = nextIndex >= 0 ? nextIndex : 0;
      render();
    };
    const unsubscribeMainline = subscribeToMainlineChanges(client, reloadVersions);
    const disposeFilmScene = state.dispose;
    state.dispose = () => {
      unsubscribeMainline();
      disposeFilmScene?.();
    };
    root.addEventListener('click', (event) => {
      if (event.target.closest('[data-mainline-film-prev]')) return move(-1);
      if (event.target.closest('[data-mainline-film-next]')) return move(1);
      const frame = event.target.closest('[data-mainline-frame-index]');
      if (!frame) return;
      const index = Number(frame.dataset.mainlineFrameIndex);
      if (index === selectedIndex && frames[index]?.version) openSelected();
      else {
        selectedIndex = index;
        render();
      }
    });
    root.addEventListener('wheel', (event) => {
      event.preventDefault();
      move(event.deltaY > 0 || event.deltaX > 0 ? 1 : -1);
    }, { passive: false });
    root.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); move(1); }
      if (event.key === 'Enter') { event.preventDefault(); openSelected(); }
    });
    let drag = null;
    root.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      if (event.target !== canvas) root.setPointerCapture(event.pointerId);
    });
    root.addEventListener('pointerup', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const x = event.clientX - drag.x;
      const y = event.clientY - drag.y;
      const delta = Math.abs(y) > Math.abs(x) ? y : x;
      if (Math.abs(delta) > 28) move(delta > 0 ? -1 : 1);
      drag = null;
    });
    render();
    root.focus({ preventScroll: true });
    return state;
  };

  const state = createWindow({
    key: 'mainline-exe',
    title: '档案纠错程序',
    code: 'ARCHIVE.COR',
    className: 'mainline-entry-window',
    icon: MAINLINE_ICON,
    body: entranceMarkup(),
  });
  if (state.mainlineEntryReady) return state;
  state.mainlineEntryReady = true;
  const root = state.windowElement.querySelector('[data-mainline-entry]');
  const enter = root.querySelector('[data-mainline-enter]');
  state.dispose = createComputerScene(
    root.querySelector('[data-mainline-computer-canvas]'),
    root.querySelector('[data-mainline-model-status]'),
    enter,
    () => {
      void openFilmstrip(root.querySelector('[data-mainline-computer-canvas]')).then(() => {
        state.windowElement.querySelector('[data-workflow-close]')?.click();
      });
    },
  );
  void loadVersions();
  return state;
};
