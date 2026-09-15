#!/usr/bin/env node
/**
 * 线上部署验收：拉取 GitHub Pages 上真实生效的密文，用 private/ 里的口令与私链令牌解密，
 * 与 private/profile.json 逐字节比对，并顺带确认证书资源可访问。
 *
 *   node scripts/verify-live.mjs
 *
 * 需要能访问 https://zijieguo2003.github.io/ 。本机走 FlClash 代理时先设：
 *   $env:HTTPS_PROXY='http://127.0.0.1:7890'; $env:NODE_USE_ENV_PROXY='1'
 * （NODE_USE_ENV_PROXY 让 Node 的 fetch 走代理，Node 24 起支持）
 *
 * 退出码 0 = 线上与本地一致；非 0 = 有未通过项（例如 Pages 还在构建、或构建失败）。
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://zijieguo2003.github.io';
const cacheBuster = `cb=${Date.now()}`;

const expected = readFileSync(join(repoRoot, 'private/profile.json'));
const localSaltOf = (path) => JSON.parse(readFileSync(join(repoRoot, path.slice(1)), 'utf8')).salt;

const b64 = (value) => new Uint8Array(Buffer.from(value, 'base64'));

async function fetchText(path) {
  const response = await fetch(`${SITE}${path}${path.includes('?') ? '&' : '?'}${cacheBuster}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function decrypt(passphrase, payload) {
  const passwordKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64(payload.salt), iterations: payload.iterations, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(payload.iv), tagLength: 128 }, key, b64(payload.data));
  return Buffer.from(plain);
}

let failures = 0;
const report = (passed, label, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  [${passed ? 'OK' : '未通过'}] ${label}${detail ? `：${detail}` : ''}`);
};

console.log('校验线上部署');

const cases = [
  { path: '/assets/data/profile.enc.json', secretFile: 'private/passphrase.txt', label: '线上口令解锁密文' },
  { path: '/assets/data/profile.link.enc.json', secretFile: 'private/link-token.txt', label: '线上私链解锁密文' }
];

for (const item of cases) {
  const secretPath = join(repoRoot, item.secretFile);
  if (!existsSync(secretPath)) {
    report(false, item.label, `缺少 ${item.secretFile}`);
    continue;
  }
  const secret = readFileSync(secretPath, 'utf8').trim();
  try {
    const payload = JSON.parse(await fetchText(item.path));
    const plain = await decrypt(secret, payload);
    const identical = Buffer.compare(plain, expected) === 0;
    // 线上密文的 salt 与本地同路径密文一致 => 线上跑的就是本地这批（部署已生效）
    const fresh = payload.salt === localSaltOf(item.path);
    report(identical && fresh, item.label,
      `明文 ${plain.length} 字节，与本地明文一致=${identical}，与本地密文同批次（已部署）=${fresh}`);
  } catch (error) {
    report(false, item.label, error.message);
  }
}

const assets = [
  '/files/egolink-acmmm2026-certificate.pdf',
  '/images/egolink-acmmm2026-certificate.png',
  '/images/egolink-acmmm2026-certificate-card.webp'
];
for (const path of assets) {
  try {
    const response = await fetch(`${SITE}${path}?${cacheBuster}`, { method: 'HEAD' });
    report(response.ok, `资源 ${path}`, `HTTP ${response.status}`);
  } catch (error) {
    report(false, `资源 ${path}`, error.message);
  }
}

console.log(failures === 0
  ? '\n线上已生效：密文可解、与本地一致、证书资源可访问。'
  : `\n有 ${failures} 项未通过——若是刚推送，先确认 GitHub Pages 构建完成（构建失败时线上会一直停在旧版本）。`);
process.exitCode = failures === 0 ? 0 : 1;
