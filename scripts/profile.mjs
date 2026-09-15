#!/usr/bin/env node
/**
 * ZijieGuo 个人主页「加密私密档案」工具链。
 *
 * 背景
 *   主页 https://zijieguo2003.github.io/ 的公开面只有 Education 一段（_pages/about.md）。
 *   完整档案（Research / News / Publications / Experience / Awards / Skills）以密文形式
 *   随站点发布，由 assets/js/profile-gate.js 在浏览器端用 WebCrypto 解密后注入页面。
 *
 * 为什么是 Node 而不是 PowerShell
 *   本站的密文是 AES-256-GCM，而 Windows PowerShell 5.1（.NET Framework）没有
 *   System.Security.Cryptography.AesGcm，本机也没装 PowerShell 7。Node 的 WebCrypto
 *   与浏览器 profile-gate.js 用的是同一套 API，因此这里的代码路径就是线上真实路径。
 *
 * 密文格式（与 profile-gate.js 严格一致，改动即线上失效）
 *   PBKDF2-HMAC-SHA256(passphrase, salt16, iterations) -> 32 字节密钥
 *   AES-256-GCM(iv12)，密文尾部追加 16 字节认证标签，整体 base64 存入 data
 *   { version: 1, kdf: 'PBKDF2-SHA256', iterations, salt, iv, data }   明文按 UTF-8 编码
 *
 * 密钥材料只放在 private/（已被 .gitignore 忽略，绝不可提交）
 *   private/profile.json      明文档案源文件 —— 改内容改这个
 *   private/passphrase.txt    弹窗解锁口令
 *   private/link-token.txt    私链令牌，配合 https://zijieguo2003.github.io/#profile=<token>
 *   private/private-link.txt  生成好的私链 URL
 *
 * 用法
 *   node scripts/profile.mjs publish                    重新加密两个密文并写出私链 URL
 *   node scripts/profile.mjs publish --show-secrets      同上，并把口令/私链打印出来
 *   node scripts/profile.mjs verify                      校验两个密文能否解开且与明文一致
 *   node scripts/profile.mjs decrypt                     用口令解开主密文，写回 private/profile.json
 *   node scripts/profile.mjs rotate-passphrase           换新口令并重新发布
 *   node scripts/profile.mjs rotate-token                换新私链令牌并重新发布
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://zijieguo2003.github.io/';
const DEFAULT_ITERATIONS = 310000;

const PATHS = {
  plaintext: 'private/profile.json',
  passphrase: 'private/passphrase.txt',
  linkToken: 'private/link-token.txt',
  linkUrl: 'private/private-link.txt',
  payload: 'assets/data/profile.enc.json',
  linkPayload: 'assets/data/profile.link.enc.json'
};

// 去掉易混淆的 0/O/1/l/I，4 组 4 字符约 79 bit 熵
const PASSPHRASE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

const abs = (path) => join(repoRoot, path);
const log = (message) => console.log(message);
const ok = (message) => console.log(`  [OK] ${message}`);
const warn = (message) => console.log(`  [注意] ${message}`);

function generatePassphrase() {
  const groups = [];
  for (let group = 0; group < 4; group += 1) {
    const bytes = randomBytes(4);
    let text = '';
    for (const byte of bytes) text += PASSPHRASE_ALPHABET[byte % PASSPHRASE_ALPHABET.length];
    groups.push(text);
  }
  return groups.join('-');
}

function generateLinkToken() {
  return randomBytes(32).toString('base64url');
}

function readSecret(path, label, generator, rotate) {
  const file = abs(path);
  if (!rotate && existsSync(file)) {
    const value = readFileSync(file, 'utf8').trim();
    if (value) return value;
  }
  const value = generator();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${value}\n`, 'utf8');
  log(`  [生成] ${label} -> ${path}`);
  return value;
}

const base64ToBytes = (value) => new Uint8Array(Buffer.from(value, 'base64'));
const bytesToBase64 = (bytes) => Buffer.from(bytes).toString('base64');

async function deriveKey(passphrase, salt, iterations) {
  const passwordKey = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// 与 profile-gate.js 的 decryptProfile() 逐行对应
async function encryptPlaintext(plainBytes, passphrase, iterations) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(passphrase, salt, iterations);
  const cipherWithTag = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, plainBytes)
  );

  // 自检：写盘前先确认浏览器那条路径能还原
  const decrypted = new Uint8Array(
    await subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, cipherWithTag)
  );
  if (Buffer.compare(Buffer.from(decrypted), Buffer.from(plainBytes)) !== 0) {
    throw new Error('往返校验失败：加密结果无法还原明文');
  }

  return {
    version: 1,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(cipherWithTag)
  };
}

async function decryptPayload(payloadPath, passphrase) {
  const file = abs(payloadPath);
  if (!existsSync(file)) throw new Error(`找不到密文：${payloadPath}`);
  const payload = JSON.parse(readFileSync(file, 'utf8'));
  const key = await deriveKey(passphrase, base64ToBytes(payload.salt), payload.iterations);
  const plain = await subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(payload.iv), tagLength: 128 },
    key,
    base64ToBytes(payload.data)
  );
  return Buffer.from(plain);
}

function writePayloadFile(payload, path) {
  const file = abs(path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(payload), 'utf8');
  return file;
}

function assertPrivateIsIgnored() {
  const gitignore = abs('.gitignore');
  const text = existsSync(gitignore) ? readFileSync(gitignore, 'utf8') : '';
  if (!/^\s*private\/?\s*$/m.test(text)) {
    warn('.gitignore 里没有 private/ —— 先补上，否则密钥材料有被提交的风险');
  }
}

async function publish({ iterations, showSecrets, rotatePassphrase, rotateToken }) {
  assertPrivateIsIgnored();

  const plainPath = abs(PATHS.plaintext);
  if (!existsSync(plainPath)) throw new Error(`找不到明文源文件 ${PATHS.plaintext}（这是内容源，不能少）`);
  const plain = readFileSync(plainPath);
  const parsed = JSON.parse(plain.toString('utf8'));
  if (!parsed.contentHtml || !parsed.sidebarHtml) {
    throw new Error(`${PATHS.plaintext} 缺少 contentHtml / sidebarHtml`);
  }

  const passphrase = readSecret(PATHS.passphrase, '访问口令', generatePassphrase, rotatePassphrase);
  const linkToken = readSecret(PATHS.linkToken, '私链令牌', generateLinkToken, rotateToken);

  log(`发布密文（明文 ${plain.length} 字节，PBKDF2 迭代 ${iterations} 次）`);
  writePayloadFile(await encryptPlaintext(plain, passphrase, iterations), PATHS.payload);
  log(`  口令解锁密文 -> ${PATHS.payload}`);
  writePayloadFile(await encryptPlaintext(plain, linkToken, iterations), PATHS.linkPayload);
  log(`  私链解锁密文 -> ${PATHS.linkPayload}`);

  const linkUrl = `${SITE_URL}#profile=${linkToken}`;
  writeFileSync(abs(PATHS.linkUrl), `${linkUrl}\n`, 'utf8');
  log(`  私链 URL -> ${PATHS.linkUrl}`);

  if (showSecrets) {
    log(`  口令：${passphrase}`);
    log(`  私链：${linkUrl}`);
  } else {
    log(`  口令 / 私链已写入 private/（加 --show-secrets 可直接打印）`);
  }

  log('\n完成。本地自检：node scripts/profile.mjs verify');
  log('提交并推送 master 后 GitHub Pages 会重建站点，线上随即改用新密文。');
}

async function verify({ showSecrets }) {
  const plainPath = abs(PATHS.plaintext);
  const expected = existsSync(plainPath) ? readFileSync(plainPath) : null;

  const cases = [
    { label: '口令解锁', payload: PATHS.payload, secretPath: PATHS.passphrase },
    { label: '私链解锁', payload: PATHS.linkPayload, secretPath: PATHS.linkToken }
  ];

  let failures = 0;
  log('校验密文（走浏览器同一套 WebCrypto 调用）');

  for (const item of cases) {
    if (!existsSync(abs(item.secretPath))) {
      log(`  [跳过] ${item.label}：缺少 ${item.secretPath}`);
      failures += 1;
      continue;
    }
    const secret = readFileSync(abs(item.secretPath), 'utf8').trim();
    try {
      const plain = await decryptPayload(item.payload, secret);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(plain);
      const parsed = JSON.parse(text);
      if (!parsed.contentHtml || !parsed.sidebarHtml) throw new Error('缺少 contentHtml / sidebarHtml');
      const identical = expected ? Buffer.compare(plain, expected) === 0 : null;
      ok(`${item.payload}（${item.label}）明文 ${plain.length} 字节，contentHtml ${parsed.contentHtml.length} 字符` +
        (identical === null ? '' : `，与 ${PATHS.plaintext} 逐字节一致：${identical}`));
      if (identical === false) failures += 1;
    } catch (error) {
      failures += 1;
      log(`  [失败] ${item.payload}（${item.label}）：${error.message}`);
    }
  }

  if (showSecrets) {
    for (const item of cases) {
      if (existsSync(abs(item.secretPath))) {
        log(`  ${item.label} 用的密钥：${readFileSync(abs(item.secretPath), 'utf8').trim()}`);
      }
    }
  }

  log(failures === 0 ? '\n全部通过。' : `\n有 ${failures} 项未通过。`);
  if (failures > 0) process.exitCode = 1;
}

async function decryptToFile() {
  if (!existsSync(abs(PATHS.passphrase))) throw new Error(`缺少 ${PATHS.passphrase}，无法解密`);
  const passphrase = readFileSync(abs(PATHS.passphrase), 'utf8').trim();
  const plain = await decryptPayload(PATHS.payload, passphrase);
  JSON.parse(plain.toString('utf8')); // 确认是合法 JSON 再落盘
  writeFileSync(abs(PATHS.plaintext), plain);
  log(`已用口令解开 ${PATHS.payload}，写回 ${PATHS.plaintext}（${plain.length} 字节）`);
}

async function main() {
  const [command = 'verify', ...flags] = process.argv.slice(2);
  const options = {
    showSecrets: flags.includes('--show-secrets'),
    rotatePassphrase: command === 'rotate-passphrase' || flags.includes('--rotate-passphrase'),
    rotateToken: command === 'rotate-token' || flags.includes('--rotate-token'),
    iterations: DEFAULT_ITERATIONS
  };

  switch (command) {
    case 'publish':
      await publish(options);
      break;
    case 'rotate-passphrase':
    case 'rotate-token':
      await publish(options);
      break;
    case 'verify':
      await verify(options);
      break;
    case 'decrypt':
      await decryptToFile();
      break;
    default:
      log('用法：node scripts/profile.mjs <publish|verify|decrypt|rotate-passphrase|rotate-token> [--show-secrets]');
      process.exitCode = 2;
  }
}

await main();
