# Supabase 登录配置

网站已经接入 Supabase 邮箱密码登录。未配置身份服务时，页面会停留在登录界面并拒绝放行。

## 1. 创建项目

在 Supabase 创建一个免费项目，并保持 Email / Password 登录方式开启。

如果网站只给固定成员使用，建议关闭公开注册，然后在 Supabase 控制台的 Authentication / Users 中由管理员创建或邀请用户。

## 2. 配置本地环境

复制 `.env.example` 为 `.env.local`，填写项目的公开连接信息：

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

`Project URL` 与 `Publishable key` 可以用于浏览器前端。不要在网站代码或环境文件中填写 `service_role` 密钥。

修改配置后重新启动开发服务：

```powershell
npm run dev
```

## 3. 配置站点地址

网站部署后，在 Supabase Authentication 的 URL Configuration 中：

- 将 Site URL 设置为正式网站地址。
- 将本地开发地址和正式网站地址加入 Redirect URLs。

当前版本使用邮箱密码登录，不开放前台注册。登录成功后会保留会话；底部任务栏提供退出按钮。

## 4. 正式上线前

- 为邮件验证、邀请和找回密码配置自定义 SMTP。
- 如果档案内容需要真正保密，将正文与私密图片迁移到 Supabase Database / Private Storage。
- 为数据库表启用 RLS，并仅允许已登录用户读取授权内容。

目前档案正文和图片仍属于前端静态资源；登录界面可以控制正常访问流程，但不能替代服务器端的数据权限。
