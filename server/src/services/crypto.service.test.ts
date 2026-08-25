// M0.5-3: crypto service 单元测试 | HRMS
import { describe, expect, it } from 'vitest';

import * as cryptoService from './crypto.service';

describe('crypto - 加密/解密基本流程', () => {
  it('encrypt → decrypt 同一明文 → 还原', () => {
    const plaintext = '110101199003078812';
    const ciphertext = cryptoService.encrypt(plaintext, 1);
    const decrypted = cryptoService.decrypt(ciphertext, 1);
    expect(decrypted).toBe(plaintext);
  });

  it('同一明文两次 encrypt → 不同密文（IV 随机）', () => {
    const plaintext = 'hello';
    const c1 = cryptoService.encrypt(plaintext, 1);
    const c2 = cryptoService.encrypt(plaintext, 1);
    expect(c1).not.toBe(c2); // 随机 IV 保证密文唯一性
  });

  it('密文包含三段（iv.ciphertext.authTag）', () => {
    const ciphertext = cryptoService.encrypt('test', 1);
    const parts = ciphertext.split('.');
    expect(parts).toHaveLength(3);
    // 每段都是合法 base64
    parts.forEach((p) => {
      expect(p).toMatch(/^[A-Za-z0-9+/=]+$/);
    });
  });
});

describe('crypto - 多版本密钥', () => {
  it('v2 加密的密文，v1 解密失败（正确性）', () => {
    const plaintext = 'secret-v2';
    const ciphertext = cryptoService.encrypt(plaintext, 2);
    // 用 v1 解 v2 密文 → 失败（GCM auth tag 不匹配）
    expect(() => cryptoService.decrypt(ciphertext, 1)).toThrow();
  });

  it('v2 加密 → v2 解密 → 还原', () => {
    const plaintext = 'secret-v2';
    const ciphertext = cryptoService.encrypt(plaintext, 2);
    const decrypted = cryptoService.decrypt(ciphertext, 2);
    expect(decrypted).toBe(plaintext);
  });

  it('v3 加密 → v3 解密 → 还原', () => {
    const plaintext = 'secret-v3';
    const ciphertext = cryptoService.encrypt(plaintext, 3);
    expect(cryptoService.decrypt(ciphertext, 3)).toBe(plaintext);
  });
});

describe('crypto - 篡改检测', () => {
  it('密文被篡改（中间段）→ 解密抛错（GCM auth tag 验证失败）', () => {
    const ciphertext = cryptoService.encrypt('important', 1);
    const parts = ciphertext.split('.');
    // 篡改密文段（前 4 个字符反转）
    const tampered = parts[1].split('').reverse().join('');
    const bad = [parts[0], tampered, parts[2]].join('.');
    expect(() => cryptoService.decrypt(bad, 1)).toThrow();
  });

  it('密文格式错（仅 2 段）→ 抛错', () => {
    expect(() => cryptoService.decrypt('only.two', 1)).toThrow();
  });

  it('auth tag 长度错 → 抛错', () => {
    const bad = 'YWFh.YmJi.Yw=='; // iv=3 字符, ct=3 字符, tag=1 字符
    expect(() => cryptoService.decrypt(bad, 1)).toThrow();
  });
});

describe('crypto - isEncrypted 工具', () => {
  it('合法密文 → true', () => {
    const ciphertext = cryptoService.encrypt('test', 1);
    expect(cryptoService.isEncrypted(ciphertext)).toBe(true);
  });

  it('普通字符串 → false', () => {
    expect(cryptoService.isEncrypted('hello')).toBe(false);
  });

  it('非 base64 字符 → false', () => {
    expect(cryptoService.isEncrypted('foo!bar.baz.qux')).toBe(false);
  });
});

describe('crypto - reencrypt 密钥轮转', () => {
  it('reencrypt(v1 → v2) → 用 v2 解密成功', () => {
    const plaintext = 'rotate me';
    const v1Ciphertext = cryptoService.encrypt(plaintext, 1);
    const v2Ciphertext = cryptoService.reencrypt(v1Ciphertext, 1, 2);
    expect(cryptoService.decrypt(v2Ciphertext, 2)).toBe(plaintext);
  });
});
