const DB_NAME = "lawsaw_app_state";
const DB_VERSION = 1;
const STORE_NAME = "kv";

type StoredValue = {
	value: unknown;
	updatedAt: number;
};

function hasIndexedDb(): boolean {
	return (
		typeof window !== "undefined" && typeof window.indexedDB !== "undefined"
	);
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (!hasIndexedDb()) {
			reject(new Error("IndexedDB is not available"));
			return;
		}

		const request = window.indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(request.error ?? new Error("Failed to open IndexedDB"));
		request.onblocked = () => reject(new Error("IndexedDB open blocked"));
	});
}

async function withStore<T>(
	mode: IDBTransactionMode,
	handler: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
	const db = await openDb();

	return await new Promise<T>((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, mode);
		const store = tx.objectStore(STORE_NAME);
		const request = handler(store);

		request.onsuccess = () => {
			resolve(request.result as T);
		};
		request.onerror = () => {
			reject(request.error ?? new Error("IndexedDB request failed"));
		};
		tx.oncomplete = () => db.close();
		tx.onerror = () => {
			db.close();
			reject(tx.error ?? new Error("IndexedDB transaction failed"));
		};
		tx.onabort = () => {
			db.close();
			reject(tx.error ?? new Error("IndexedDB transaction aborted"));
		};
	});
}

export async function readIndexedDbJson<T>(key: string): Promise<T | null> {
	if (!hasIndexedDb()) return null;
	try {
		const payload = await withStore<StoredValue | undefined>(
			"readonly",
			(store) => store.get(key),
		);
		if (!payload || typeof payload !== "object" || !("value" in payload)) {
			return null;
		}
		return (payload as StoredValue).value as T;
	} catch {
		return null;
	}
}

export async function writeIndexedDbJson<T>(
	key: string,
	value: T,
): Promise<boolean> {
	if (!hasIndexedDb()) return false;
	try {
		const payload: StoredValue = {
			value,
			updatedAt: Date.now(),
		};
		await withStore("readwrite", (store) => store.put(payload, key));
		return true;
	} catch {
		return false;
	}
}
