# PALIS UI 不变量

**用途：** C00 基线、后续 UI 实施前置审查和 `ui-checker` 完成后复核。  
**适用技能：** `ui-ux-pro-max`、`ui-checker`。  
**优先级：** 委托人明确要求与现有 PALIS 产品合同高于技能的通用技术栈建议。

## 1. 视觉系统

- 继续使用现有 `--space`、`--cold-*`、`--win-*`、`--paper*`、`--archive-*`、`--clerk-*`。
- 继续使用 Noto Serif SC、Noto Sans SC、IBM Plex Mono 及现有后备顺序。
- 不新增 Tailwind、React、motion/react、Radix、Base UI、渐变主题或通用后台组件库。
- 继续使用现有 PALIS SVG 图标和复古光标，不使用 emoji 作为结构图标。
- 新界面必须复用 `retro-window`、现有标题栏、任务栏、纸张、边框、阴影和 danger token。

## 2. 窗口与动效

- 公开档案、文档、局部窗口和工作台的当前行为分别建立基线，统一底层时允许保留表面配置差异。
- PALIS 已批准的 480ms 展开、270ms 内容到达、260ms 最小化、300ms 还原和 240ms 关闭属于品牌例外，不按通用时长建议改写。
- 新动效只允许使用 `transform` 与 `opacity`；`will-change` 只在活动动画期间存在。
- 必须支持 `prefers-reduced-motion`，关闭动画后状态、焦点和任务栏结果仍一致。
- 移动端不依赖拖拽；关键操作必须有可见按钮。

## 3. 可访问性与交互

- icon-only 按钮必须提供准确的 `aria-label`。
- 表单使用可见 label；只读与 disabled 在语义和视觉上区分。
- 错误放在相关字段或动作附近，说明原因和恢复方法；异步错误通过 `aria-live` 通知但不抢焦点。
- 颜色不能成为唯一状态信号；状态同时使用文字、图标、边框或形状。
- 弹窗必须有清晰关闭/取消路径；破坏性确认默认聚焦安全选项，关闭后焦点返回触发元素。
- loading 状态禁用重复提交并显示明确进度；空状态只给出一个主要下一步。

## 4. 响应式与触控

- 固定任务栏、弹窗和控制区继续使用 safe-area 变量。
- 390×844、375×812、移动横屏和 1440×900 均不得出现页面级非设计性横向滚动。
- 移动端关键触控命中区域至少 44×44px；可保持现有小图标外观，通过透明命中区扩大。
- 长标题、超长词条、系统字体放大时仍可滚动和读取，不能遮住提交/取消按钮。
- 固定任务栏必须为滚动内容预留底部空间。

## 5. 性能

- 首屏之外的图片、正文和验证面板按需加载；图片声明尺寸或比例，避免布局跳动。
- 50 条以上的审核队列、目录或事件列表必须分页、分段或虚拟化。
- 高频输入、滚动、resize 和拖拽计算必须节流/防抖，并批量处理布局读写。
- UI 交互反馈目标在 100ms 内出现；超过 300ms 的读取显示现有 PALIS loading/skeleton 状态。

## 6. 每项 UI 改动的验收记录

每次记录：

1. 改动前后 1440×900、390×844、375×812 和移动横屏截图。
2. 键盘 Tab 顺序、焦点返回、Escape/取消路径。
3. hover、pressed、disabled、loading、success、error、empty 状态。
4. reduced-motion 结果。
5. safe-area、任务栏遮挡和横向溢出。
6. 控制台 error、页面 error 和网络失败反馈。
7. 新增 CSS 是否只复用现有 token。
# C00 deterministic browser baseline

- Capture 39 scenes: first-entry home, clean home, clerk workspace, admin workspace, and nine archive directories at `1440x900`, `390x844`, and `844x390`.
- Only loopback, `data:`, and `blob:` requests are permitted. `/rest/v1/archives` has a deterministic empty JSON fixture; every other external request is fatal.
- Capture writes only to `tmp/verification/current/`. Normal verification compares it to `tmp/verification/baseline/`; only `verify:baseline:update` can replace the baseline after diagnostics and network validation.
- Pixel comparison uses `threshold: 0.1`, `includeAA: false`, `alpha: 0.5`, and fails above `0.5%` changed pixels.
