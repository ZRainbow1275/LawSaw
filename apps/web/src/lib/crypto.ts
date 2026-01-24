/**
 * localStorage 加密存储工具
 * 使用 AES-GCM 算法加密敏感数据
 */

// 加密密钥（生产环境应从环境变量获取）
const ENCRYPTION_KEY = "lawsaw-secure-storage-key-2024";

/**
 * 生成加密密钥
 */
async function getKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(ENCRYPTION_KEY),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("lawsaw-salt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * 加密数据
 */
export async function encryptData(data: unknown): Promise<string> {
  try {
    const key = await getKey();
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(JSON.stringify(data))
    );

    // 合并 IV 和加密数据
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    // Base64 编码
    return btoa(String.fromCharCode(...combined));
  } catch {
    // 降级到普通 JSON
    return JSON.stringify(data);
  }
}

/**
 * 解密数据
 */
export async function decryptData<T = unknown>(encrypted: string): Promise<T | null> {
  try {
    // 尝试解析为普通 JSON（兼容旧数据）
    try {
      return JSON.parse(encrypted) as T;
    } catch {
      // 继续尝试解密
    }

    const key = await getKey();
    const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

    const iv = combined.slice(0, 12);
    const data = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted)) as T;
  } catch {
    return null;
  }
}

/**
 * 安全存储类
 */
export class SecureStorage {
  private prefix: string;

  constructor(prefix = "lawsaw") {
    this.prefix = prefix;
  }

  private getKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    try {
      const encrypted = await encryptData(value);
      localStorage.setItem(this.getKey(key), encrypted);
    } catch {
      // 降级到普通存储
      localStorage.setItem(this.getKey(key), JSON.stringify(value));
    }
  }

  async getItem<T>(key: string): Promise<T | null> {
    try {
      const stored = localStorage.getItem(this.getKey(key));
      if (!stored) return null;
      return await decryptData<T>(stored);
    } catch {
      return null;
    }
  }

  removeItem(key: string): void {
    localStorage.removeItem(this.getKey(key));
  }

  clear(): void {
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith(this.prefix + ":")
    );
    keys.forEach((k) => localStorage.removeItem(k));
  }
}

// 默认实例
export const secureStorage = new SecureStorage();

/**
 * 简单的数据混淆（用于非敏感但需要保护的数据）
 */
export function obfuscate(data: string): string {
  return btoa(encodeURIComponent(data));
}

export function deobfuscate(data: string): string {
  try {
    return decodeURIComponent(atob(data));
  } catch {
    return data;
  }
}
