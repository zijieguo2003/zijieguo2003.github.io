# zijieguo2003.github.io —— 个人主页（源码）

线上地址：**https://zijieguo2003.github.io/**

Jekyll 站点，由 GitHub Pages 原生构建（无 GitHub Actions、无 Gemfile）。
模板结构沿用 [AcadHomepage](https://github.com/rayeren/acad-homepage.github.io)。

> 同工作区里那个名叫 `zijieguo2003.github.io` 的目录**不是**本仓库，而是 Hugo 博客
> （remote `zijieguo2003/blog.git`，对应线上 `/blog/`）。本仓库在同级的 `zijieguo2003-homepage/`。

---

## 页面结构：公开面 + 加密私密档案

首页 `_pages/about.md`（`permalink: /index.html`）在未解锁时**只显示 Education 一段**，
导航项、侧栏 bio 与社交链接全部隐藏（`_includes/author-profile.html` 用
`{% unless page.profile_gate %}` 直接不渲染，不是靠 CSS 遮挡）。

完整档案（Research Interests / News / Publications / Research & Internships / Education /
Honors and Awards / Skills）以密文形式随站点发布在
`assets/data/profile.enc.json`，由 `assets/js/profile-gate.js` 在浏览器端解密后注入页面。

两条解锁路径：

| 路径 | 做法 | 密钥来源 |
|---|---|---|
| 口令 | 侧栏头像 **3.5 秒内连点 5 次** → 输入口令 | `private/passphrase.txt` |
| 私链 | 打开 `https://zijieguo2003.github.io/#profile=<token>` | `private/link-token.txt` |

解密结果缓存在 `sessionStorage`，同一会话内刷新免重复输入。密钥（口令）不经过服务器，
URL 里的私链令牌放在 hash 中，同样不会发给服务器。

---

## 目录速览

| 路径 | 作用 |
|---|---|
| `_config.yml` | 站点配置（`url` = 线上域名，`include: _pages / files`，`exclude` 排除 `tmp`、`private`） |
| `_pages/about.md` | 首页，公开面内容（目前只有 Education）+ `profile_gate: true` |
| `_layouts/default.html` | 页面骨架 |
| `_includes/head/custom.html` | favicon / manifest，以及首屏 `profile-locked` 防闪烁 |
| `_includes/scripts.html` | 按 `page.profile_gate` 决定是否加载 `profile-gate.js` |
| `assets/js/profile-gate.js` | 解密与解锁逻辑（含注入后重绑 lightbox） |
| `assets/data/profile.enc.json` | 口令解锁密文（**由脚本生成，不要手改**） |
| `assets/data/profile.link.enc.json` | 私链解锁密文（同上） |
| `assets/css/main.scss` | 样式（含 `.profile-locked` / `.profile-gate-*`） |
| `images/` `logos/` `files/` | 图片、机构 logo、可下载文件（如获奖证书 PDF） |
| `scripts/profile.mjs` | 加密 / 校验 / 解密工具链 |
| `private/` | **本地密钥材料，已被 .gitignore 忽略，绝不提交** |
| `tmp/` | 临时产物（抓取的线上页面、渲染沙盒等），同样不提交 |

---

## 改内容的流程

```bash
# 1. 改明文源（这是唯一的内容源）
#    private/profile.json 里的 contentHtml / sidebarHtml
# 2. 重新加密两个密文 + 刷新私链 URL
node scripts/profile.mjs publish
# 3. 本地自检（走浏览器同一套 WebCrypto）
node scripts/profile.mjs verify
# 4. 提交并推送，GitHub Pages 自动重建
git add -A && git commit -m "..." && git push
```

只改公开面（Education 那段）时，直接编辑 `_pages/about.md`，不需要重新加密。

工具链全部命令：

| 命令 | 作用 |
|---|---|
| `node scripts/profile.mjs publish` | 用 `private/` 里的口令与令牌重新加密两个密文，并写出 `private/private-link.txt` |
| `node scripts/profile.mjs publish --show-secrets` | 同上，并把口令与私链打印到终端 |
| `node scripts/profile.mjs verify` | 校验两个密文能解开、是合法 UTF-8、且与 `private/profile.json` 逐字节一致 |
| `node scripts/profile.mjs decrypt` | 用口令解开主密文，写回 `private/profile.json` |
| `node scripts/profile.mjs rotate-passphrase` | 换新口令并重新发布（旧口令立即作废） |
| `node scripts/profile.mjs rotate-token` | 换新私链令牌并重新发布（旧的私链立即失效） |

> 用 Node 而不是 PowerShell：本站密文是 AES-256-GCM，而 Windows PowerShell 5.1
> （.NET Framework）没有 `System.Security.Cryptography.AesGcm`，本机也没装 PowerShell 7。
> Node 的 WebCrypto 与浏览器 `profile-gate.js` 是同一套 API。

---

## 密钥材料（`private/`）

| 文件 | 内容 |
|---|---|
| `private/profile.json` | 明文档案源文件（内容改这里） |
| `private/passphrase.txt` | 弹窗解锁口令 |
| `private/link-token.txt` | 私链令牌 |
| `private/private-link.txt` | 生成好的私链 URL |

- 这四份文件**永远不要提交**（`.gitignore` 已忽略 `private/`，`_config.yml` 也排除了它）。
- 建议把口令与私链存进密码管理器。
- 换了机器就从密码管理器恢复，或直接用新口令重新 `publish`（明文源丢了就只能 `decrypt` 找回）。

### 安全须知

- 证书、图片、PDF 这类**资源一旦放进仓库就是公开可访问的 URL**（`https://zijieguo2003.github.io/files/xxx.pdf`），
  加密只保护页面上的引用位置，不保护文件本身。获奖证书这类本就用于展示的材料没问题。
- `assets/data/*.enc.json` 是密文，公开也无妨；安全性取决于口令强度（PBKDF2-SHA256，310000 次迭代）。

---

## 获奖证书（ACM MM 2026 EgoLink Challenge · Third Place · Track 1）

| 文件 | 说明 |
|---|---|
| `files/egolink-acmmm2026-certificate.pdf` | 原始证书 PDF（172 KB，来自主办方） |
| `images/egolink-acmmm2026-certificate.png` | 1800px 预览图，供 lightbox 打开 |
| `images/egolink-acmmm2026-certificate-card.webp` / `-card.png` | 900px 卡片图（39 KB / 163 KB），正文内嵌（`<picture>` 优先 WebP，PNG 兜底） |

展示位置：加密档案的 **Honors and Awards** 区块里的 `notice--info` 卡片——
文字一行（赛事 / 名次 / Track 1 / Team TeleAI）+ 两个链接（赛事主页、证书 PDF）+
证书缩略图（点击由 magnific-popup 放大，`profile-gate.js` 在注入内容后会重新绑定 lightbox）。

---

## 本地预览的坑

本仓库依赖 GitHub Pages 的原生 Jekyll 构建，**本地没有 Ruby / Jekyll 时无法直接构建**。
可用的替代验证方式：

1. `node scripts/profile.mjs verify`——确认密文与明文一致、浏览器能解开。
2. 离线渲染沙盒：把解密后的 `contentHtml` / `sidebarHtml` 注入抓取下来的线上页面骨架，
   去掉脚本与 CDN 引用后用 Chrome 无头截图检查排版（本次加证书卡片时就是这么验的）。
3. 推送到 `master` 后等 GitHub Pages 重建，再在浏览器里用私链核对。

---

## 部署

```
git push origin master
  → GitHub Pages（原生 Jekyll 构建，无 workflow）
  → https://zijieguo2003.github.io/
```

GitHub Pages 使用的插件必须在白名单内，因此 `_config.yml` 的 `plugins` 只列了
`jekyll-paginate` / `jekyll-sitemap` / `jekyll-gist` / `jekyll-feed` / `jekyll-redirect-from`。
