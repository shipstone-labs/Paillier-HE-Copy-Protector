/**
 * Key storage using IndexedDB for secure client-side key management
 */

import type { PaillierPublicKey } from './paillier';

export interface StoredKey {
  id: string;
  name: string;
  publicKey: {
    n: string; // Store as hex string
    g: string;
  };
  createdAt: Date;
  lastUsed: Date;
}

export class KeyStorage {
  private dbName = 'PaillierKeyStore';
  private dbVersion = 1;
  private storeName = 'keys';
  private db: IDBDatabase | null = null;
  
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });
  }
  
  /**
   * Store a public key
   */
  async storeKey(name: string, publicKey: PaillierPublicKey): Promise<string> {
    if (!this.db) await this.init();
    
    const id = crypto.randomUUID();
    const storedKey: StoredKey = {
      id,
      name,
      publicKey: {
        n: publicKey.n.toString(16),
        g: publicKey.g.toString(16),
      },
      createdAt: new Date(),
      lastUsed: new Date(),
    };
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.add(storedKey);
      
      request.onsuccess = () => resolve(id);
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * Retrieve a public key by ID
   */
  async getKey(id: string): Promise<StoredKey | null> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);
      
      request.onsuccess = () => {
        const key = request.result;
        if (key) {
          // Update last used timestamp
          this.updateLastUsed(id);
        }
        resolve(key || null);
      };
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * Get all stored keys
   */
  async getAllKeys(): Promise<StoredKey[]> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * Delete a key by ID
   */
  async deleteKey(id: string): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * Convert stored key to PaillierPublicKey
   */
  static toPaillierPublicKey(storedKey: StoredKey): PaillierPublicKey {
    const n = BigInt('0x' + storedKey.publicKey.n);
    const g = BigInt('0x' + storedKey.publicKey.g);
    return {
      n,
      g,
      n_squared: n * n,
    };
  }
  
  /**
   * Import a public key from hex strings
   */
  async importKey(name: string, nHex: string, gHex: string): Promise<string> {
    const publicKey: PaillierPublicKey = {
      n: BigInt('0x' + nHex),
      g: BigInt('0x' + gHex),
      n_squared: 0n, // Will be computed
    };
    publicKey.n_squared = publicKey.n * publicKey.n;
    
    return this.storeKey(name, publicKey);
  }
  
  /**
   * Export a key as JSON
   */
  async exportKey(id: string): Promise<string> {
    const key = await this.getKey(id);
    if (!key) throw new Error('Key not found');
    
    return JSON.stringify({
      name: key.name,
      publicKey: key.publicKey,
      createdAt: key.createdAt,
    }, null, 2);
  }
  
  private async updateLastUsed(id: string): Promise<void> {
    const transaction = this.db!.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    const getRequest = store.get(id);
    
    getRequest.onsuccess = () => {
      const key = getRequest.result;
      if (key) {
        key.lastUsed = new Date();
        store.put(key);
      }
    };
  }
}