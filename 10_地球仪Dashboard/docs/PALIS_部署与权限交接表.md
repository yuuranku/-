# PALIS 部署与权限交接表

> 给后续 Codex 对话、开发者或部署人员的固定上下文。任何人新增功能前，先以本表核对；没有得到站长明确许可，不得修改权限模型、Supabase 项目、管理员锚点或既有迁移。

## 0. 先给其他对话的简版指令

```text
这是 PALIS（白帷）网站。请在现有部署契约内修改，不能重置、替换或猜测数据库权限。

- 生产前端：Cloudflare 静态资产，域名 beneaththewhiteveil.com，SPA 回退开启。
- 生产数据库：Supabase 项目 hpzdccfrouhljqlzczuv；前端只能使用 VITE_SUPABASE_URL 与 VITE_SUPABASE_PUBLISHABLE_KEY，绝不使用 service_role key。
- 权限唯一来源：public.profiles.role 与 public.profiles.enabled，不是前端变量、邮箱输入值或 user_metadata。
- 角色只有：admin / clerk / observer。管理员也可使用书记官工作台；不能把管理员限制成“只能管理”。
- 任何新表、RPC、RLS、触发器或 Edge Function 都必须兼容既有角色模型，并写成新的顺序迁移；禁止 reset、drop 既有 profiles、auth.users、RLS 或 policy。
- 改动委托系统前，确认数据库已按顺序执行至 202608050007_commission_editing_lock.sql，且已部署 admin-manage-user 与 admin-invite-user 两个 Edge Function。
- 不得改动受保护管理员的邮箱锚点或管理员初始化逻辑，除非站长明确授权并同时给出迁移方案。
- 完成后至少运行 npm test 与 npm run build，并说明是否需要执行 Supabase migration / Edge Function deploy。
```

---

## 1. 生产环境身份

| 项目项 | 固定值／规则 | 当前配置位置 | 改动规则 |
| --- | --- | --- | --- |
| 网站 | PALIS / 白帷档案系统 | 本仓库 | 保持单页应用行为 |
| 生产域名 | `beneaththewhiteveil.com` | `wrangler.jsonc` | 不得自行改路由或域名 |
| 托管 | Cloudflare 静态资产（Workers Assets） | `wrangler.jsonc` | `assets.directory` 必须为 `./dist`；`not_found_handling` 必须为 `single-page-application` |
| Supabase 项目 Ref | `hpzdccfrouhljqlzczuv` | `supabase/.temp/project-ref` | 任何本地、预览、生产构建必须确认连向同一项目；不得换成测试项目 |
| 前端环境变量 | `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY` | `.env.production.local`（不入库） | 两者必须同时存在；只允许 URL 与 publishable/anon key |
| 服务端密钥 | `SUPABASE_SERVICE_ROLE_KEY` | 仅 Supabase Edge Function secrets | 绝不能写入 `VITE_*`、浏览器代码、仓库或聊天记录 |
| 本地管理员预览 | `VITE_PALIS_LOCAL_ADMIN=1`，且仅限 `localhost/127.0.0.1` 开发环境 | `src/runtime/palis-runtime.js` | 不是线上权限方案，生产环境绝不能开启 |

## 2. 权限模型（不可替换）

| 项目项 | 规定 |
| --- | --- |
| 唯一权限来源 | `public.profiles` 表中的 `role` 和 `enabled`。登录后前端只读取 `id,email,display_name,role,enabled`。资料不存在或 `enabled=false` 即视为无权限。 |
| 合法角色 | `admin`、`clerk`、`observer`，不能新增前端自定义角色来绕开 RLS。 |
| 管理员 | 可用全部管理员工具，也可用书记官档案袋、委托工作台与九类档案编辑能力。 |
| 书记官 | 可编辑本人草稿、接收开放委托、提交档案；不能管理账号、发布/结算委托或审核。 |
| 观察员 | 只能读取公开内容和被单独授权的内容；不能写档案或接收委托。 |
| 停用账号 | `profiles.enabled=false`；应保留历史档案，不可通过删除资料来抹除贡献记录。 |
| 登记（职级） | `profiles.clerk_rank`，范围 1–7，仅管理员在账户管理内调整；它不是经验值，也不改变 RLS 角色。 |
| 管理员锚点 | 现有数据库触发器、修复迁移和 Edge Function 都有一个受保护管理员邮箱锚点。未经站长明确授权，不能修改、删除或把它换成前端可配置值。若必须更换，必须一次性迁移 `auth.users`、`profiles`、触发器、两支 Edge Function，并由旧管理员验证。 |

### 管理员身份排查 SQL（只在 Supabase SQL Editor 执行）

```sql
-- 登录用户必须在这里有一行，并且 role='admin'、enabled=true。
select id, email, display_name, role, enabled, clerk_rank
from public.profiles
order by created_at;

-- 用于确认三种角色都仍被保留，而不是被迁移覆盖。
select role, enabled, count(*)
from public.profiles
group by role, enabled
order by role, enabled;
```

不得用前端代码、`user_metadata.role` 或浏览器本地存储来“补管理员权限”。

## 3. Supabase 必须具备的部件

| 部件 | 用途 | 部署要求 |
| --- | --- | --- |
| `auth.users` + `public.profiles` | 登录与角色映射 | 需要 `on_auth_user_created` 触发器；已有账号必须在 `profiles` 有对应记录 |
| RLS / `public.is_admin()` | 所有档案、审核、账号管理的真实权限边界 | 不能关闭 RLS 来临时“修复”权限 |
| `archive-*` 表 | 九类档案、草稿、版本、审核、通知、附件 | 必须保留历史记录和 RLS policy |
| `workflow_tasks` | 仅用于管理员发布的档案委托；主线不是在此新建 | 依赖迁移 `202608050003` 之后的所有迁移 |
| `workflow_task_responses` | 书记官认领委托、关联其档案草稿 | `paused` / `closed` 后书记官不可继续写入 |
| `list_public_workflow_tasks(boolean)` | 公共档案系统的委托清单 | 必须为现有带 `template_id` 的版本（迁移 `202608050006`） |
| `list_public_clerk_directory()` | PALIS 助手显示书记官姓名与登记 | 只能暴露 `id`、`display_name`、`clerk_rank`，绝不能暴露邮箱 |
| `admin-manage-user` | 账户创建、角色、登记、密码、停用 | 必须部署；需要下列 3 个 Edge secrets |
| `admin-invite-user` | 邀请书记官／观察员 | 必须部署；需要下列 3 个 Edge secrets |
| `archive-attachments` Storage bucket | 私有附件 | 保持私有桶与既有 storage RLS，不得设为 public |

### Edge Function secrets（只在 Supabase 后台设置）

| Secret 名 | 值来源 | 是否可进入前端 |
| --- | --- | --- |
| `SUPABASE_URL` | 当前 Supabase 项目 URL | 否 |
| `SUPABASE_ANON_KEY` | 当前 Supabase 项目的 anon/publishable key | 否 |
| `SUPABASE_SERVICE_ROLE_KEY` | 当前 Supabase 项目的 service role key | **绝对禁止** |

## 4. 迁移顺序与本轮功能依赖

所有 SQL 必须按文件名升序执行。新功能只能新增新的迁移文件，不能把旧迁移改成适配某一次部署的临时版本。

| 最低迁移节点 | 提供内容 | 未部署时会发生什么 |
| --- | --- | --- |
| `202607270001_archive_workflow.sql` | `profiles`、基础角色、RLS、九类档案、附件桶 | 登录后没有正确角色或基础工作台无法工作 |
| `202607270002_repair_admin_and_official_archives.sql` | 既有管理员资料修复与官方档案 | 既有管理员可能没有 `profiles` 记录 |
| `202608010001`–`202608010003` | 主线档案纠错程序与实时能力 | 主线系统不能与工作台正确联动 |
| `202608050003_workflow_tasks.sql` | 档案委托表、认领表、管理员发布权限 | 委托窗口无法读取或认领 |
| `202608050004_clerk_registration.sql` | `profiles.clerk_rank` | 登记显示/调整失败 |
| `202608050005_public_clerk_directory.sql` | PALIS 助手书记官目录 RPC | 助手内书记官登记无法读取 |
| `202608050006_commission_archive_template.sql` | 委托对应九类档案模板 | 编辑委托无法打开正确档案编辑器 |
| `202608050007_commission_editing_lock.sql` | 暂停/停止接收后锁定编辑 | 已认领委托仍可能被继续编辑 |
| `202608060001_repair_supplement_attachment_role.sql` | 补充附件（`supplement`）上传规则修复 | 上传普通附件时报 `unknown archive media role` |

部署新版本前的最低数据库状态：必须已执行至 `202608060001_repair_supplement_attachment_role.sql`。

## 5. 正确部署顺序

1. 确认 Supabase CLI 已链接到项目 `hpzdccfrouhljqlzczuv`，不是临时项目。
2. 先备份/导出数据库；**禁止** `supabase db reset`、删除 `auth.users`、删除 `profiles` 或关闭 RLS。
3. 将所有未执行的 `supabase/migrations/*.sql` 按顺序推送到同一项目。
4. 部署两支 Edge Function：`admin-manage-user`、`admin-invite-user`；确认三个 server secrets 都已存在。
5. 在 SQL Editor 用第 2 节查询确认至少一个 `admin enabled=true` 和现有书记官记录都在。
6. 使用管理员账号登录，检查账户管理、书记官档案袋、档案委托发布；再使用书记官账号检查认领和编辑。
7. 最后构建并发布前端静态资产。前端构建使用该 Supabase 项目的两个 `VITE_*` 值；不要把本地管理员预览变量带到生产构建。

## 6. 改动时的硬性边界

| 允许 | 不允许 |
| --- | --- |
| 新增顺序迁移、补充 policy、补充 RPC／触发器 | `db reset`、手改已发布迁移、删除已有 policy 或用 `service_role` 替代客户端权限 |
| 管理员可调整书记官 `clerk_rank` | 用 XP、前端积分或职级判断替代 `profiles.role` |
| 委托系统关联书记官贡献记录 | 将主线档案改为普通 `workflow_tasks` 委托 |
| 管理员进入和使用书记官全部功能 | 将管理员限制为“只上传/只管理” |
| 公开读取受限目录 RPC 的姓名和登记 | 公开 `profiles.email`、service role key、私有附件 |
| 先部署数据库/函数，再部署依赖它们的前端 | 只上线前端而数据库仍是旧 schema |

## 7. 权限突然消失时的排查顺序

1. 查看线上构建时的 `VITE_SUPABASE_URL` 是否仍是项目 `hpzdccfrouhljqlzczuv`，而不是空值、旧项目或预览项目。
2. 确认登录用户的 `auth.users.id` 与 `public.profiles.id` 相同，且 `profiles.enabled=true`。
3. 确认该行的 `role` 是 `admin` / `clerk` / `observer` 之一；管理员必须是 `admin`。
4. 确认迁移已顺序执行至 `202608060001`，两支 Edge Function 已重新部署并有服务端 secrets。
5. 只要上述任一项不满足，先修复部署一致性；不要用浏览器代码硬加管理员界面或临时关闭 RLS。

## 8. 交付验收

每次涉及登录、工作台、委托或档案权限的改动，交付说明必须回答：

- 是否新增迁移；文件名是什么；线上是否已执行。
- 是否修改 Edge Function；哪一支；线上是否已部署并保留 secrets。
- 管理员、书记官、观察员三种身份分别能做什么。
- 管理员是否仍能使用书记官档案袋和委托工作台。
- 暂停/停止接收后的委托是否在界面、客户端和数据库三层都不可编辑。
- 已运行 `npm test` 与 `npm run build` 的结果。
