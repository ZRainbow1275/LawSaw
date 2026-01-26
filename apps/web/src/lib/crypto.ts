/**
 * 客户端本地存储加密工具（localStorage）
 *
 * 说明：
 * - 不使用硬编码密钥（前端代码无法安全持有“秘密”）。
 * - 使用每个浏览器本地生成的非导出 `CryptoKey`（IndexedDB 持久化）进行 AES-GCM 加密。
 * - 该机制用于降低“仅静态读取磁盘 localStorage”的风险，**不能**防御 XSS/恶意脚本。
 */

const KEY_DB_NAME = "lawsaw_secure_storage";
const KEY_STORE_NAME = "crypto_keys";
const KEY_ID = "default";

let dbPromise: Promise<IDBDatabase> | null = null;
let keyPromise: Promise<CryptoKey | null> | null = null;

function safeJsonStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return "null";
	}
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

function openKeyDb(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise;

	dbPromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(KEY_DB_NAME, 1);

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
				db.createObjectStore(KEY_STORE_NAME);
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(request.error ?? new Error("Failed to open IndexedDB"));
	});

	return dbPromise;
}

async function readKeyFromDb(db: IDBDatabase): Promise<CryptoKey | null> {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(KEY_STORE_NAME, "readonly");
		const store = tx.objectStore(KEY_STORE_NAME);
		const request = store.get(KEY_ID);

		request.onsuccess = () => resolve((request.result as CryptoKey | null) ?? null);
		request.onerror = () =>
			reject(request.error ?? new Error("Failed to read key from IndexedDB"));
	});
}

async function writeKeyToDb(db: IDBDatabase, key: CryptoKey): Promise<void> {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(KEY_STORE_NAME, "readwrite");
		const store = tx.objectStore(KEY_STORE_NAME);
		const request = store.put(key, KEY_ID);

		request.onsuccess = () => resolve();
		request.onerror = () =>
			reject(request.error ?? new Error("Failed to write key to IndexedDB"));
	});
}

async function getKey(): Promise<CryptoKey | null> {
	if (typeof window === "undefined") return null;
	if (typeof indexedDB === "undefined") return null;
	if (!globalThis.crypto?.subtle) return null;

	if (keyPromise) return keyPromise;

	keyPromise = (async () => {
		try {
			const db = await openKeyDb();
			const existing = await readKeyFromDb(db);
			if (existing) return existing;

			const generated = await crypto.subtle.generateKey(
				{ name: "AES-GCM", length: 256 },
				false,
				["encrypt", "decrypt"],
			);

			await writeKeyToDb(db, generated);
			return generated;
		} catch {
			return null;
		}
	})();

	return keyPromise;
}

/**
 * 加密数据
 */
export async function encryptData(data: unknown): Promise<string> {
	try {
		const key = await getKey();
		if (!key) return safeJsonStringify(data);

		const encoder = new TextEncoder();
		const iv = crypto.getRandomValues(new Uint8Array(12));

		const encrypted = await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv },
			key,
			encoder.encode(safeJsonStringify(data)),
		);

		// 合并 IV 和加密数据
		const combined = new Uint8Array(iv.length + encrypted.byteLength);
		combined.set(iv);
		combined.set(new Uint8Array(encrypted), iv.length);

		// Base64 编码
		return bytesToBase64(combined);
	} catch {
		// 降级到普通 JSON
		return safeJsonStringify(data);
	}
}

/**
 * 解密数据
 */
export async function decryptData<T = unknown>(
	encrypted: string,
): Promise<T | null> {
	try {
		// 尝试解析为普通 JSON（兼容旧数据）
		try {
			return JSON.parse(encrypted) as T;
		} catch {
			// 继续尝试解密
		}

		const key = await getKey();
		if (!key) return null;

		const combined = base64ToBytes(encrypted);
		if (combined.length <= 12) return null;

		const iv = combined.slice(0, 12);
		const data = combined.slice(12);

		const decrypted = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv },
			key,
			data,
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
		if (typeof window === "undefined") return;

		try {
			const encrypted = await encryptData(value);
			localStorage.setItem(this.getKey(key), encrypted);
		} catch {
			// 降级到普通存储
			localStorage.setItem(this.getKey(key), safeJsonStringify(value));
		}
	}

	async getItem<T>(key: string): Promise<T | null> {
		if (typeof window === "undefined") return null;

		try {
			const stored = localStorage.getItem(this.getKey(key));
			if (!stored) return null;
			return await decryptData<T>(stored);
		} catch {
			return null;
		}
	}

	removeItem(key: string): void {
		if (typeof window === "undefined") return;
		localStorage.removeItem(this.getKey(key));
	}

	clear(): void {
		if (typeof window === "undefined") return;
		const keys = Object.keys(localStorage).filter((k) =>
			k.startsWith(`${this.prefix}:`),
		);
		for (const k of keys) {
			localStorage.removeItem(k);
		}
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
