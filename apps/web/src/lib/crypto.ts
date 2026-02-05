/**
 * Client-side encrypted storage utilities (localStorage).
 *
 * Notes:
 * - No hardcoded key: frontend code cannot safely keep secrets.
 * - Uses a per-browser non-extractable `CryptoKey` (persisted via IndexedDB) for AES-GCM.
 * - Reduces the risk of offline disk scraping of localStorage, but **does not** protect against XSS.
 */

const KEY_DB_NAME = "lawsaw_secure_storage";
const KEY_STORE_NAME = "crypto_keys";
const KEY_ID = "default";

const ENCRYPTED_PREFIX = "enc:v1:";
const PLAINTEXT_PREFIX = "plain:v1:";

let warnedPlaintextFallback = false;
function warnPlaintextFallback(reason: string): void {
	if (warnedPlaintextFallback) return;
	warnedPlaintextFallback = true;
	console.warn(
		`SecureStorage encryption unavailable; storing PLAINTEXT (${reason}).`,
	);
}

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

		request.onsuccess = () =>
			resolve((request.result as CryptoKey | null) ?? null);
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
 * Encrypt data.
 */
export async function encryptData(data: unknown): Promise<string> {
	const json = safeJsonStringify(data);
	const key = await getKey();
	if (!key) {
		warnPlaintextFallback("missing key");
		return `${PLAINTEXT_PREFIX}${json}`;
	}

	try {
		const encoder = new TextEncoder();
		const iv = crypto.getRandomValues(new Uint8Array(12));

		const encrypted = await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv },
			key,
			encoder.encode(json),
		);

		// Combine IV and ciphertext.
		const combined = new Uint8Array(iv.length + encrypted.byteLength);
		combined.set(iv);
		combined.set(new Uint8Array(encrypted), iv.length);

		// Base64 encoding.
		return `${ENCRYPTED_PREFIX}${bytesToBase64(combined)}`;
	} catch (error) {
		warnPlaintextFallback(error instanceof Error ? error.message : "unknown");
		return `${PLAINTEXT_PREFIX}${json}`;
	}
}

/**
 * Decrypt data.
 */
export async function decryptData<T = unknown>(
	encrypted: string,
): Promise<T | null> {
	try {
		if (encrypted.startsWith(PLAINTEXT_PREFIX)) {
			return JSON.parse(encrypted.slice(PLAINTEXT_PREFIX.length)) as T;
		}

		const payload = encrypted.startsWith(ENCRYPTED_PREFIX)
			? encrypted.slice(ENCRYPTED_PREFIX.length)
			: encrypted;

		// Backward compatibility: legacy payload may be raw JSON.
		try {
			return JSON.parse(payload) as T;
		} catch {
			// Continue with AES-GCM decryption.
		}

		const key = await getKey();
		if (!key) return null;

		const combined = base64ToBytes(payload);
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
 * Encrypted storage wrapper.
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

		const encrypted = await encryptData(value);
		localStorage.setItem(this.getKey(key), encrypted);
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

// Default instance
export const secureStorage = new SecureStorage();

/**
 * Lightweight obfuscation (for non-sensitive data).
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
