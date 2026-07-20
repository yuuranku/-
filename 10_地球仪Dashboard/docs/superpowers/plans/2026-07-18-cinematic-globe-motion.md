# Cinematic Globe Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将四页地球转场升级为带弧线、三维旋转、缩放越位和快速响应的电影式轨道镜头，并将最终南极视图放大约 30%。

**Architecture:** 保留 `getGlobeLayout(progress)` 作为位置和基础倍率轨迹，新建纯函数 `getGlobeMotion(progress)` 输出俯仰、偏航、翻滚和倍率脉冲。渲染循环组合基础南极四元数与滚动姿态四元数；测试分别验证锚点倍率、轨迹曲率、旋转幅度和滚动响应。

**Tech Stack:** JavaScript、Three.js、ThreeGlobe、Node.js `node:test`、Vite、浏览器实际滚动验收。

---

### Task 1: 为电影式轨迹建立失败测试

**Files:**
- Modify: `tests/globe-layout.test.mjs:1-122`
- Test: `tests/globe-layout.test.mjs`

- [ ] **Step 1: 增加姿态函数加载器**

```js
async function loadGlobeMotion() {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const interpolateSource = extractFunction(source, 'interpolateLayoutValue');
  const motionSource = extractFunction(source, 'getGlobeMotion');
  const THREE = {
    MathUtils: {
      clamp: (value, min, max) => Math.min(Math.max(value, min), max),
      lerp: (from, to, amount) => from + (to - from) * amount,
    },
  };
  return new Function('THREE', `${interpolateSource}; ${motionSource}; return getGlobeMotion;`)(THREE);
}
```

- [ ] **Step 2: 增加南极倍率、弧线和三维动作测试**

```js
test('polar landing is at least 1.75 times the directory scale', async () => {
  const { getGlobeLayout } = await loadGlobeLayout({ width: 2048, height: 988 });
  assert.ok(getGlobeLayout(1).scale / getGlobeLayout(2 / 3).scale >= 1.75);
});

test('overview-to-directory path bends away from a straight line', async () => {
  const viewport = { width: 2048, height: 988 };
  const { camera, getGlobeLayout } = await loadGlobeLayout(viewport);
  const start = getGlobeLayout(0.4);
  const middle = getGlobeLayout(0.55);
  const end = getGlobeLayout(0.66);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.abs(dx * (start.y - middle.y) - (start.x - middle.x) * dy) / Math.hypot(dx, dy);
  const worldHeight = 2 * camera.position.z * Math.tan((camera.fov * Math.PI / 180) / 2);
  assert.ok(distance >= worldHeight * 0.04, `expected a visible arc, received ${distance.toFixed(2)}`);
});

test('four-page motion includes large rotation and depth changes', async () => {
  const getGlobeMotion = await loadGlobeMotion();
  const overview = getGlobeMotion(1 / 3);
  const directory = getGlobeMotion(2 / 3);
  const polar = getGlobeMotion(1);
  assert.ok(Math.abs(directory.yaw - overview.yaw) >= 0.7);
  assert.ok(Math.abs(polar.yaw - directory.yaw) >= 0.8);
  assert.ok(Math.max(Math.abs(getGlobeMotion(0.23).roll), Math.abs(getGlobeMotion(0.9).pitch)) >= 0.1);
  assert.ok(Math.abs(getGlobeMotion(0.93).zoom - 1) >= 0.06);
});
```

- [ ] **Step 3: 运行测试并确认按预期失败**

Run: `node --test tests/globe-layout.test.mjs`

Expected: 原有 3 项通过；新测试因南极倍率不足、路径共线和缺少 `getGlobeMotion` 而失败。

- [ ] **Step 4: 提交测试（Git 身份配置后执行）**

```powershell
git add -- tests/globe-layout.test.mjs
git commit -m "test: define cinematic globe motion"
```

### Task 2: 放大南极并把直线路径改成电影式弧线

**Files:**
- Modify: `src/main.js:2468-2535`
- Test: `tests/globe-layout.test.mjs`

- [ ] **Step 1: 提高最终南极倍率**

将桌面端倍率改为：

```js
const polarScale = desktopAspect < 1.7 ? 0.86 : 0.94;
```

- [ ] **Step 2: 为概览到目录轨迹加入弧线高度**

```js
const settleIntro = (p, remaining, arcLift = 0) => ({
  p,
  x: introCornerX * remaining,
  y: THREE.MathUtils.lerp(stageCenterY, introCornerY, remaining)
    + stageHeight * worldPerPixel * arcLift,
  scale: THREE.MathUtils.lerp(fit(archiveScale), introScale, remaining),
});
```

桌面关键帧使用：

```js
settleIntro(0.49, 0.76, 0.1),
settleIntro(0.57, 0.45, 0.15),
settleIntro(0.63, 0.14, 0.06),
```

- [ ] **Step 3: 扩大接入页和南极页的镜头轨迹**

在接入到概览之间增加左侧蓄力和上拱中点；在目录到南极之间使用以下 S 形推进关键帧：

```js
const polarSwingX = viewportWidth * worldPerPixel * 0.07;
const polarSwingY = stageHeight * worldPerPixel * 0.08;

{ p: 0.82, x: 0, y: stageCenterY, scale: fit(archiveScale) },
{ p: 0.86, x: -polarSwingX, y: stageCenterY + polarSwingY, scale: fit(polarScale * 0.78) },
{ p: 0.93, x: polarSwingX * 0.35, y: stageCenterY - polarSwingY * 0.35, scale: polarScale * 1.07 },
{ p: 0.98, x: 0, y: stageCenterY, scale: polarScale * 1.02 },
{ p: 1, x: 0, y: stageCenterY, scale: fit(polarScale) },
```

- [ ] **Step 4: 运行布局测试**

Run: `node --test tests/globe-layout.test.mjs`

Expected: 南极倍率和弧线测试通过；姿态测试仍因缺少 `getGlobeMotion` 失败。

- [ ] **Step 5: 提交布局轨迹（Git 身份配置后执行）**

```powershell
git add -- src/main.js tests/globe-layout.test.mjs
git commit -m "feat: add cinematic globe flight paths"
```

### Task 3: 增加滚动驱动的三维旋转与深度脉冲

**Files:**
- Modify: `src/main.js:190-200`
- Modify: `src/main.js:2360-2375`
- Modify: `src/main.js:2537-2560`
- Test: `tests/globe-layout.test.mjs`

- [ ] **Step 1: 添加纯姿态轨迹函数**

```js
function getGlobeMotion(progress) {
  const keys = [
    { p: 0, pitch: 0, yaw: 0, roll: 0, zoom: 1 },
    { p: 0.12, pitch: -0.04, yaw: -0.18, roll: -0.04, zoom: 0.94 },
    { p: 0.23, pitch: 0.08, yaw: 0.38, roll: -0.14, zoom: 1.1 },
    { p: 0.3, pitch: 0.02, yaw: 0.62, roll: -0.08, zoom: 1 },
    { p: 0.4, pitch: 0.02, yaw: 0.62, roll: -0.08, zoom: 1 },
    { p: 0.49, pitch: -0.08, yaw: 0.95, roll: 0.06, zoom: 1.08 },
    { p: 0.57, pitch: 0.12, yaw: 1.28, roll: 0.12, zoom: 0.94 },
    { p: 0.66, pitch: 0, yaw: 1.48, roll: 0, zoom: 1 },
    { p: 0.82, pitch: 0, yaw: 1.55, roll: 0, zoom: 1 },
    { p: 0.9, pitch: -0.18, yaw: 2.02, roll: -0.14, zoom: 0.93 },
    { p: 0.96, pitch: 0.06, yaw: 2.46, roll: 0.05, zoom: 1.08 },
    { p: 1, pitch: 0, yaw: 2.62, roll: 0, zoom: 1 },
  ];
  const index = Math.min(keys.findIndex((key) => key.p >= progress), keys.length - 1);
  const to = keys[Math.max(index, 1)];
  const from = keys[Math.max(index - 1, 0)];
  const amount = from === to ? 0 : THREE.MathUtils.clamp((progress - from.p) / (to.p - from.p), 0, 1);
  return Object.fromEntries(['pitch', 'yaw', 'roll', 'zoom'].map((property) => [
    property,
    interpolateLayoutValue(keys, index - 1, index, amount, property),
  ]));
}
```

- [ ] **Step 2: 创建可复用姿态对象并组合四元数**

```js
const scrollMotionEuler = new THREE.Euler(0, 0, 0, 'XYZ');
const scrollMotionQuaternion = new THREE.Quaternion();
```

渲染循环中：

```js
const motion = getGlobeMotion(scrollProgress);
const motionStrength = reducedMotion ? 0 : (window.visualViewport?.width || innerWidth) < 761 ? 0.55 : 1;
const motionZoom = 1 + (motion.zoom - 1) * motionStrength;
globeRoot.scale.setScalar(layout.scale * motionZoom);

globeRoot.quaternion.slerpQuaternions(identityQuaternion, polarQuaternion, polarBlend);
scrollMotionEuler.set(
  motion.pitch * motionStrength,
  motion.yaw * motionStrength,
  motion.roll * motionStrength,
);
scrollMotionQuaternion.setFromEuler(scrollMotionEuler);
globeRoot.quaternion.multiply(scrollMotionQuaternion);
```

- [ ] **Step 3: 运行全部自动测试**

Run: `node --test tests/globe-layout.test.mjs`

Expected: 6 项测试全部通过，0 项失败。

- [ ] **Step 4: 提交三维姿态（Git 身份配置后执行）**

```powershell
git add -- src/main.js tests/globe-layout.test.mjs
git commit -m "feat: add scroll-driven globe rotation"
```

### Task 4: 实际页面验收与构建

**Files:**
- Verify: `src/main.js`
- Verify: `tests/globe-layout.test.mjs`

- [ ] **Step 1: 在 `http://127.0.0.1:4173/` 依次滚动四页**

记录 0%、33%、67%、100% 四个锚点，确认概览页四分之一地球、总目录圆心和南极居中均保持正确。

- [ ] **Step 2: 正向和反向验收三段转场**

确认每段同时包含弧线、旋转和缩放，并且主要运动在浏览器滚动结束后约 55ms 内跟上，不出现额外拖尾。

- [ ] **Step 3: 检查窄屏与减少动画模式**

桌面窄屏姿态幅度为完整版本的 55%；`prefers-reduced-motion` 下姿态强度为 0，并直接使用页面锚点。

- [ ] **Step 4: 检查浏览器错误并生成最终南极截图**

Expected: 页面错误日志为空；截图中南极地球比旧版大约 25–30%，左右面板仍可见。

- [ ] **Step 5: 运行最终验证**

Run: `node --test tests/globe-layout.test.mjs`

Expected: 6 项测试全部通过。

Run: `npm.cmd run build`

Expected: Vite 构建退出码为 0。

- [ ] **Step 6: 最终提交（Git 身份配置后执行）**

```powershell
git add -- src/main.js tests/globe-layout.test.mjs docs/superpowers/plans/2026-07-18-cinematic-globe-motion.md
git commit -m "feat: deliver cinematic globe transitions"
```
