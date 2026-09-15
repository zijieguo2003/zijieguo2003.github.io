# ZijieGuo 个人主页 — 项目状态文档

> 本文件记录项目的**当前状态与关键设计决策**，供 AI 代理（Codex、Claude 等）接手时快速同步上下文。
> **每次对项目做出实质性修改后必须同步更新本文件。**
> 人类向的说明在 `README.md`，本文件偏"实现细节 + 踩过的坑"。

---

## 技术栈与线上地址

| 项 | 值 |
|---|---|
| 站点 | Jekyll（**由 GitHub Pages 原生构建**，无 `.github/workflows`、无 Gemfile） |
| 模板来源 | AcadHomepage（`rayeren/acad-homepage.github.io`，结构照搬） |
| 线上 URL | https://zijieguo2003.github.io/ |
| 仓库 | `zijieguo2003/zijieguo2003.github.io`，分支 `master` |
| 本地目录 | `D:\Dev\Projects\Sites\zijieguo2003-homepage\`（同级 `zijieguo2003.github.io\` 是别的仓库：Hugo 博客，对应 `/blog/`） |
| 构建 | 推送 `master` 后 GitHub Pages 自动重建，无本地构建能力（无 Ruby/Jekyll） |

---

## 核心设计：profile gate（公开面 + 加密档案）

未解锁时首页**只有 Education**。这不是 CSS 遮挡：

1. `_pages/about.md` 带 `profile_gate: true`，正文只有 Education 一段，`permalink: /index.html`。
2. `_includes/author-profile.html` 用 `{% unless page.profile_gate %}` 把侧栏 bio 与全部社交链接
   **从 HTML 里彻底移除**（未解锁页面源码里没有邮箱/GitHub 链接）。
3. `_includes/head/custom.html` 首屏内联脚本给 `<html>` 加 `.profile-locked`，避免解锁后闪烁；
   该 class 在 `assets/css/main.scss` 里隐藏除 "Homepage" 外的导航项、移动端菜单按钮、`.page-views`。
4. `_includes/scripts.html` 仅在 `page.profile_gate` 为真时加载 `assets/js/profile-gate.js`。
5. 解锁后由 JS 用解密结果 `innerHTML` 覆盖 `.page__content` 与 `.profile_box`。

两条解锁路径：

| 路径 | 入口 | 密钥文件 |
|---|---|---|
| 口令 | 侧栏头像 3.5 秒内连点 5 次（`attachHiddenEntrance`） | `private/passphrase.txt` |
| 私链 | `https://zijieguo2003.github.io/#profile=<token>`（`readPrivateLinkKey`） | `private/link-token.txt` |

解锁结果写入 `sessionStorage['zijie-profile-unlocked-v1']`，同会话刷新免输入。
口令与 token 都不经过服务器（token 在 URL hash 中，浏览器不会发送）。

---

## 密文格式（改动即线上失效，勿动）

```
PBKDF2-HMAC-SHA256(passphrase, salt=16B, iterations=310000) -> 32B key
AES-256-GCM(iv=12B, tagLength=128)，密文 || 16B tag，整体 base64
{ version: 1, kdf: 'PBKDF2-SHA256', iterations, salt, iv, data }
明文 = private/profile.json 的原始字节（UTF-8，无 BOM），本身是 {"contentHtml":..,"sidebarHtml":..}
```

对应实现：浏览器侧 `assets/js/profile-gate.js` 的 `decryptProfile()`；
生成侧 `scripts/profile.mjs` 的 `encryptPlaintext()` / `decryptPayload()`。

---

## 工具链

`scripts/profile.mjs`（Node，唯一入口）：

| 命令 | 作用 |
|---|---|
| `publish` | 读 `private/profile.json` → 写两个密文 + `private/private-link.txt`，并在写盘前做加密→解密自检 |
| `publish --show-secrets` | 同上，并把口令/私链打印出来 |
| `verify` | 解密两个密文，校验严格 UTF-8、含 `contentHtml`/`sidebarHtml`、与明文逐字节一致 |
| `decrypt` | 用口令解开主密文写回 `private/profile.json` |
| `rotate-passphrase` / `rotate-token` | 轮换密钥后重新发布 |

**为什么不是 PowerShell**：本机 `pwsh` 实际是 Windows PowerShell 5.1（.NET Framework 4.8），
**没有 `System.Security.Cryptography.AesGcm`**，也没装 PowerShell 7。
历史上 `tmp/encrypt-profile.ps1` 就是因此无法在本机运行而留下的死代码（已删除）。
Node 的 WebCrypto 与浏览器是同一套 API，用它才等价于线上真实路径。

---

## 密钥材料与不可提交清单

`private/`（**已 gitignore，绝不提交**）：`profile.json`（明文源）、`passphrase.txt`、
`link-token.txt`、`private-link.txt`。
`tmp/`（已 gitignore）：线上页面抓取、Chrome 调试配置、渲染沙盒、一次性脚本。

`_config.yml` 的 `exclude` 里同时排除了 `tmp`、`private`、`verify-desktop.png` 作为第二道防线
（Jekyll 默认**不会**排除 `tmp/` 这类普通目录，一旦被提交就会原样发布到线上）。

---

## 已知坑

### 1. 本机没有 PS7 / Jekyll / Ruby
`pwsh` 是 5.1；`C:\Program Files\PowerShell\7` 不存在；`ruby`/`jekyll`/`bundle` 都没有。
所以：加解密走 Node，页面验证走"离线渲染沙盒 + Chrome 无头截图"。

### 2. `_config.yml` 必须 `include: _pages`
Jekyll 默认忽略下划线开头的目录，不加这条首页就没了。`files` 同样在 include 列表里，
用来发布可下载文件（获奖证书 PDF 就放这儿）。

### 3. 注入内容的 lightbox 需要重绑
`assets/js/main.min.js` 里 `$("a[href$='.png']").addClass("image-popup").magnificPopup(...)`
只在页面加载时跑一次，而档案内容是解密后注入的，那时早已跑完。
因此 `profile-gate.js` 的 `showFullProfile()` 里调用了 `refreshImageLightbox()` 重新绑定，
否则点了缩略图只会跳到原图。

### 4. 明文里的相对路径
`contentHtml` 里的 `images/xxx.png`、`files/xxx.pdf` 是**相对首页**的（`/index.html` 同目录），
注入后解析为 `/images/...` 正确。不要写成 `{{ ... | relative_url }}`——那段 HTML 存在 JSON 里，
不经过 Liquid 处理。

### 5. `_pages/about.md` 的 Education 与密文里的 Education 是两份
公开面那份在 `_pages/about.md`（明文，未解锁可见）；
密文里的 Education 在 `private/profile.json` 的 `contentHtml` 里（解锁后覆盖显示）。
改学历信息要**两处都改**。

### 6. 早期密文的编码教训
曾怀疑旧密文的 emoji 损坏——实测（用仍有效的私链令牌解密旧密文）**并没有**，
旧密文是完全正常的 UTF-8。真正的教训只有一条：**口令丢了无法恢复**（AES-GCM 无验证器、无备份），
只能靠 `private/profile.json` 重新加密，或用仍有效的私链令牌确认可用性。

---

## 验证手法（没有本地构建时的替代）

```bash
# 1) 密文 ↔ 明文 一致性（浏览器同款 WebCrypto）
node scripts/profile.mjs verify

# 2) 离线渲染沙盒：把解密内容注入抓取的线上页面骨架，Chrome 无头截图
#    骨架 = tmp/live-*.html，CSS = 线上 /assets/css/main.css 的本地副本（tmp/live-main.css）
#    注意：抓到的页面里资源是绝对路径 /assets/...，且带 ?v= 缓存戳，转 file:// 前要
#    1) 去掉前导 /  2) 先删 ?v=...（先删 ?v=1 会把 ?v=1787916306 削成 "main.css787916306"）
#    截图：chrome --headless=new --window-size=1240,1300 --screenshot=out.png file:///.../awards.html
```

---

## 资源清单（与本项目强相关）

| 文件 | 说明 |
|---|---|
| `files/egolink-acmmm2026-certificate.pdf` | ACM MM 2026 EgoLink Challenge 证书原件 |
| `images/egolink-acmmm2026-certificate.png` | 1800px 预览（lightbox） |
| `images/egolink-acmmm2026-certificate-card.webp` | 900px 卡片图（39 KB，正文内嵌，PNG 兜底 `<picture>`） |
| `images/*-method.png`、`images/grpo-evolution-tree.jpg` | 论文方法图 |
| `logos/*.png` | 机构 logo（pku / njupt / ntu / teleai / meituan / aibd） |

---

## 维护约定

- 改内容 → 改 `private/profile.json` → `node scripts/profile.mjs publish` → `verify` → 提交推送。
- **每次实质性修改后更新本文件**（新增章节、改密文格式、换工具链、发现新坑都要写进来）。
- 不要提交 `private/` 与 `tmp/`；新增临时目录时同步更新 `.gitignore` 与 `_config.yml` 的 `exclude`。
