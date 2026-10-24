import type { Asset, Project } from '../types';

const DB_NAME = 'cutline-local-v1';
const DB_VERSION = 1;
const PROJECTS = 'projects';
const ASSETS = 'assets';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('IndexedDB is not available in this browser.'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(ASSETS)) db.createObjectStore(ASSETS, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local project storage.'));
  });
}

async function transact<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = action(tx.objectStore(storeName));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Local storage request failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Local storage transaction was aborted.'));
    tx.oncomplete = () => db.close();
  });
}

export async function saveProject(project: Project): Promise<void> {
  await transact(PROJECTS, 'readwrite', store => store.put(project));
}

export async function listProjects(): Promise<Project[]> {
  const rows = await transact<Project[]>(PROJECTS, 'readonly', store => store.getAll());
  return (rows ?? []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<Project | undefined> {
  return transact<Project | undefined>(PROJECTS, 'readonly', store => store.get(id));
}

export async function storeAssetBlob(id: string, name: string, blob: Blob): Promise<void> {
  await transact(ASSETS, 'readwrite', store => store.put({ id, name, blob, updatedAt: Date.now() }));
}

export async function getAssetBlob(id: string): Promise<Blob | undefined> {
  const row = await transact<{ id: string; name: string; blob: Blob } | undefined>(ASSETS, 'readonly', store => store.get(id));
  return row?.blob;
}

export async function importAssetBlobs(assets: Asset[]): Promise<Map<string, Blob>> {
  const rows = await transact<Array<{ id: string; blob: Blob }>>(ASSETS, 'readonly', store => store.getAll());
  const byId = new Map((rows ?? []).map(row => [row.id, row.blob]));
  return new Map(assets.flatMap(asset => byId.has(asset.id) ? [[asset.id, byId.get(asset.id)!] as const] : []));
}

export async function removeProject(id: string): Promise<void> {
  await transact(PROJECTS, 'readwrite', store => store.delete(id));
}

export async function estimateStorage(): Promise<{ usage?: number; quota?: number }> {
  if (!('storage' in navigator) || !navigator.storage.estimate) return {};
  const estimate = await navigator.storage.estimate();
  return { usage: estimate.usage, quota: estimate.quota };
}
