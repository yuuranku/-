# 白幕档案终端

一个以实时 Three.js 地球为视觉锚点的滚动叙事网站。视觉方向是 `1-bit 像素抖动 + 冷战红蓝档案标记 + Windows 98 档案终端 + 轨道舱接入视角`。

## 体验结构

1. **轨道舱接入**：真实感太空舱图像作为底层结构，上方叠加 1-bit 阈值渲染层；加载条持续变化，并显示英文机构与档案核对状态。
2. **白幕概览**：地球从画面外绕回右下角，只露出约三分之一到四分之一，文本保持左侧大标题排版。
3. **档案索引**：地球回到中心，一层目录以文件夹形式围绕地球。进入二级目录后，不再复用地球圆环，而是按内容类型切换浏览方式。
4. **分类浏览器**：国家使用核心参与国优先的索引卡片，组织使用阵营档案链，站点使用站务台账，入口使用坐标节点网，生态使用纵向地层，物种分植物/动物标本柜，人物使用档案袋卡组，事件使用可拖动胶片时间带，异常事件使用时间诊断台。
5. **南极站点网络**：尾页地球转向南极，恢复原站点地图功能，可拖动旋转、滚轮缩放、筛选网络与查看具体站点/入口。

完整镜头、状态机、组件边界和验收标准见 [DESIGN_PLAN.md](./DESIGN_PLAN.md)。

## 交互

- 滚动或右侧章节导航切换段落。
- 一级文件夹进入分类目录；二级条目点开后从当前位置展开 Win98 文档窗口，按 `Esc` 关闭。
- 人物目录可用上一份/下一份按钮翻看档案袋卡组。
- 事件目录可横向拖动或滚轮浏览胶片时间带。
- 南极尾页可拖动地球、滚轮缩放、点击坐标读取档案。
- 系统开启“减少动态效果”时，循环与缓动会减弱。

## 内容规模

- 国家 18 项
- 组织 22 项（PALIS另列为管理系统，不计入组织）
- 科考站点 20 项
- 白幕入口节点 18 项（17处下降点、1处地表支援节点；界面已移除 BZ-00 名义中心）
- 生态 7 层
- 相关人物 32 名
- 事件 26 组（1921年国联南极开发署首卷至1964年西线归队事件）
- 异常 16 类
- 物种 14 类（植物 6、动物 8）

人物与事件中的公开黑白照片来自公有领域档案素材；对虚构事件而言，这些图片只作为时代氛围与胶片质感参考，不声明为事件原始证据。来源见 [public/assets/archive/SOURCES.md](./public/assets/archive/SOURCES.md)。

## PALIS 设定

首页接入的系统正式命名为 **PALIS（Polar Archive Liaison & Index System，极地档案联络与索引系统）**，隶属南极公约监管办公室；`CHANNEL 09A` 是白幕联合记录频道。PALIS 只登记来源、权限、版本冲突与调阅轨迹，不负责判断哪份档案是真相。完整世界观条目见 [南极公约监管办公室 PALIS 极地档案联络与索引系统](../02_世界观设定/08_主要阵营/南极公约监管办公室_PALIS极地档案联络与索引系统.md)。

## 本地运行

```powershell
npm install
npm run dev
```

生产构建：

```powershell
npm run build
```

也可以双击 `一键打开地球仪Dashboard.cmd`。

## 档案正文同步

网站九类详情正文以`../02_世界观设定/13_九类档案扩写稿_待确认/`中的九份母稿为来源。V00另接入`../03_事件档案/1938-1939_德国南极考察暗片带事件.md`的完整事件卷。母稿修改后运行：

```powershell
npm run archive:sync
npm run build
```

同步脚本会校验九类条目数，并生成`src/archive-longform.js`。生成文件只供网站读取，正文修改仍在母稿中完成。

## 书记官与管理员工作台

登录后的角色共用同一套本地工作台。书记官可打开九类网页设定卡、编辑与引用档案、上传不超过 5MB 的附件、暂存并提交审核；管理员登录后，工作台会显示为“管理员工作台”，并额外提供账号管理、审核批复、母本/归档标记、公开/封存/离线设置和正式录入。

编辑内容会在输入后 800ms 写入浏览器本地暂存，停止输入 5 秒后再同步云端。网页异常关闭或电脑闪退后，重新打开同一设定卡会提示恢复本地版本或使用云端版本。附件受浏览器安全限制，异常退出后需要重新选择，但已上传成功的附件不会受影响。

一个正式档案可以包含多位提交者的多份真实记录。审核通过并正式录入几份，档案中就显示几份可切换记录，不生成示例记录，也不附加虚构的“总览”页。记录会显示提交者、修改者、审核者、版本历史和可点击的档案引用。

九份原始网页设定卡位于 [public/templates](./public/templates)，工作流实现位于 [src/archive-workflow](./src/archive-workflow)。

## Supabase 工作流配置

网站仍可部署为免费的 Cloudflare 静态站；登录、档案工作流、私有附件和审核记录使用 Supabase 免费层。当前实现不启用 Realtime，也不做高频轮询。

1. 创建 Supabase 项目，在 Authentication 中关闭公开注册。
2. 按顺序执行下列迁移：

   - [202607270001_archive_workflow.sql](./supabase/migrations/202607270001_archive_workflow.sql)：建立数据表、RLS、九类模板、私有附件桶、审核/录入函数和公开记录读取函数。
   - [202607270002_repair_admin_and_official_archives.sql](./supabase/migrations/202607270002_repair_admin_and_official_archives.sql)：修复主管理员资料并登记网站既有官方档案。
   - [202607270003_archive_editor_pipeline.sql](./supabase/migrations/202607270003_archive_editor_pipeline.sql)：允许管理员提交草稿，建立自动档号、模板简称与修改母版本链。

3. 在 Supabase Authentication 后台创建首个用户 `717652849@qq.com`。数据库触发器会把这个邮箱设为受保护管理员。
4. 部署正式账号管理函数：

```powershell
supabase functions deploy admin-manage-user
supabase secrets set SUPABASE_URL="https://项目.supabase.co"
supabase secrets set SUPABASE_ANON_KEY="项目匿名密钥"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="仅供函数使用的服务密钥"
```

5. 将 [.env.example](./.env.example) 复制为 `.env.local`，只填写可公开的项目地址和 Publishable Key：

```text
VITE_SUPABASE_URL=https://项目.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`SUPABASE_SERVICE_ROLE_KEY` 只能放在 Edge Function secrets，不能写入任何 `VITE_*` 变量或提交到仓库。配置完成后，管理员可直接建立书记官或观察员账号、设置正式密码、切换权限、重置密码或停用登录；Supabase 不提供旧密码明文，因此后台只显示密码已设置状态。网站界面不提供自行注册。

本地验证：

```powershell
npm test
npm run build
```

## 主要文件

- [src/main.js](./src/main.js)：Three.js 地球、滚动状态机、档案目录、胶片拖动、人物卡组与地图交互。
- [src/archive-data.js](./src/archive-data.js)：九类档案目录、索引字段和展示类型。
- [src/archive-longform.js](./src/archive-longform.js)：由九类本地母稿生成的136份完整正文。
- [scripts/generate-archive-longform.mjs](./scripts/generate-archive-longform.mjs)：母稿解析、条目计数和网站数据生成。
- [src/archive-visuals.js](./src/archive-visuals.js)：分类中心视觉图形。
- [src/data.js](./src/data.js)：白幕入口、科考站与运输线路数据。
- [src/style.css](./src/style.css)：1-bit 视觉、Win98 控件、分类浏览器、响应式和减少动态规则。
- [public/assets/capsule-real-window.png](./public/assets/capsule-real-window.png)：image2 生成的真实感黑白空间站舷窗底图，页面中以照片层和 1-bit 阈值层叠加使用。

## 构建说明

Three.js 与 three-globe 会形成较大的主包，Vite 构建时会提示单块超过 500 kB。当前首屏需要立即显示实时地球，因此暂不延迟加载；后续如果拆成多页，可以把南极地图数据和控制面板拆为动态模块。
