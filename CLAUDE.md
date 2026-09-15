# ZijieGuo 个人主页 — 协作指南

## 维护约定

**每次对项目做出实质性修改后，必须同步更新 `AGENTS.md`。**
`AGENTS.md` 是面向所有 AI 代理的项目状态快照（技术栈、profile gate 机制、密文格式、
工具链、已知坑、验证手法），保持它准确是协作的基础。人类向说明在 `README.md`。

---

## 核心事实

- 站点：Jekyll，**GitHub Pages 原生构建**（无 workflow、无 Gemfile），线上 https://zijieguo2003.github.io/
- 本目录 `zijieguo2003-homepage/` 是**主页**仓库 `zijieguo2003/zijieguo2003.github.io`
  （同级那个叫 `zijieguo2003.github.io` 的目录是 Hugo 博客，对应 `/blog/`）
- 首页公开面只有 Education；完整档案加密在 `assets/data/profile.enc.json`，
  由 `assets/js/profile-gate.js` 在浏览器端解密注入

## 硬性约定

| 约定 | 原因 |
|---|---|
| **绝不提交 `private/`** | 里面有明文档案、口令、私链令牌；仓库是公开的 |
| **绝不提交 `tmp/`** | 抓取的页面、Chrome 调试配置、渲染中间产物 |
| 改内容必须重新加密 | `node scripts/profile.mjs publish`，否则线上还是旧密文 |
| 不要改密文格式 | `profile-gate.js` 与 `scripts/profile.mjs` 必须严格对齐 |
| 用 Node 而非 PowerShell | 本机 `pwsh` 是 5.1（.NET Framework 无 `AesGcm`），Node WebCrypto 与浏览器同款 |
| 加解密只走 `scripts/profile.mjs` | 别手写一次性脚本，格式一旦错位线上就解锁不了 |

## 常用命令

```bash
node scripts/profile.mjs publish     # 明文 -> 重新加密两个密文
node scripts/profile.mjs verify      # 校验密文能解开且与明文一致
node scripts/profile.mjs --help      # 全部子命令见文件头注释
```

## 改公开面内容

直接编辑 `_pages/about.md`（未解锁时可见的那部分），不需要重新加密。
注意 Education 在公开面与密文里各有一份，改学历信息要两处都改。
