// M0.5-3: 字段加密 crypto service | HRMS
// 算法：AES-256-GCM（认证加密，integrity + confidentiality）
// 主密钥：从 env.ENCRYPTION_KEY 加载（64 个 hex 字符 = 32 字节）
// 密文格式：base64(iv).base64(ciphertext).base64(authTag) — 12+16 字节 nonce/auth tag
// 多版本密钥：keyVersion 标记，支持 rotateKey 时保留旧版本解密能力

import {
  createCipheriv, createDecipheriv, randomBytes, createHmac,
} from 'crypto';

import { env } from '../lib/env';
import { AppError } from '../middleware/errorHandler';

// ============== 工具：密钥派生 ==============

/**
 * 根据 version 从主密钥派生特定版本的密钥
 * v1: 主密钥本身（v1 兼容老数据）
 * v2: HMAC-SHA256(masterKey, 'v2')
 * v3: HMAC-SHA256(masterKey, 'v3')
 * ...
 * 这样轮转密钥无需保存多套主密钥，只换 version 即可
 */

// ============== 常量 ==============

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM 推荐 12 字节
const AUTH_TAG_LENGTH = 16; // GCM auth tag 长度
const KEY_LENGTH = 32; // 256 位 = 32 字节

// 密文分隔符（base64 字符集不含 '.'，安全作为分隔符）
const SEPARATOR = '.';

// ============== 工具：base64 编解码 ==============

function toBase64(buf: Buffer): string {
  return buf.toString('base64');
}

function fromBase64(s: string): Buffer {
  return Buffer.from(s, 'base64');
}
function deriveKey(version: number): Buffer {
  if (version === 1) {
    return Buffer.from(env.ENCRYPTION_KEY, 'hex');
  }
  return createHmac('sha256', env.ENCRYPTION_KEY)
    .update(`v${version}`)
    .digest();
}

// ============== 核心：加密 ==============

/**
 * 加密一段明文 → 返回 base64(iv).base64(ciphertext).base64(authTag)
 * @throws AppError 40101 加密失败
 */
export function encrypt(plaintext: string, keyVersion: number = 1): string {
  try {
    const key = deriveKey(keyVersion);
    if (key.length !== KEY_LENGTH) {
      throw new Error(`派生密钥长度错误: ${key.length}`);
    }
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGO, key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [
      toBase64(iv),
      toBase64(ciphertext),
      toBase64(authTag),
    ].join(SEPARATOR);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new AppError(`加密失败: ${msg}`, 500, 40101);
  }
}

// ============== 核心：解密 ==============

/**
 * 解密一段密文 → 返回明文
 * @throws AppError 40102 解密失败（密文损坏 / 密钥不匹配 / 篡改）
 */
export function decrypt(ciphertextBase64: string, keyVersion: number = 1): string {
  try {
    const parts = ciphertextBase64.split(SEPARATOR);
    if (parts.length !== 3) {
      throw new Error('密文格式错误（应包含 iv.ciphertext.authTag 三段）');
    }
    const [ivBase64, ctBase64, tagBase64] = parts as [string, string, string];

    const iv = fromBase64(ivBase64);
    const ciphertext = fromBase64(ctBase64);
    const authTag = fromBase64(tagBase64);

    if (iv.length !== IV_LENGTH) {
      throw new Error(`IV 长度错误: ${iv.length}`);
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error(`Auth tag 长度错误: ${authTag.length}`);
    }

    const key = deriveKey(keyVersion);
    if (key.length !== KEY_LENGTH) {
      throw new Error(`派生密钥长度错误: ${key.length}`);
    }

    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(), // 验证 auth tag，篡改会抛错
    ]);
    return plaintext.toString('utf8');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new AppError(`解密失败: ${msg}`, 500, 40102);
  }
}

// ============== 工具：检测密文 ==============

/**
 * 判断字符串是否像加密后的密文
 * 用于 API 返回时判断：明文 vs 密文，避免重复加密
 */
export function isEncrypted(value: string): boolean {
  if (typeof value !== 'string') return false;
  const parts = value.split(SEPARATOR);
  if (parts.length !== 3) return false;
  // 每段必须是合法 base64
  return parts.every((p) => /^[A-Za-z0-9+/=]+$/.test(p));
}

// ============== 密钥轮转辅助 ==============

/**
 * 用新版本密钥重新加密一段旧密文
 * 用于批量密钥轮转：旧 v1 密文 → 解密 → 用 v2 重加密
 */
export function reencrypt(
  oldCiphertext: string,
  oldVersion: number,
  newVersion: number,
): string {
  const plaintext = decrypt(oldCiphertext, oldVersion);
  return encrypt(plaintext, newVersion);
}
