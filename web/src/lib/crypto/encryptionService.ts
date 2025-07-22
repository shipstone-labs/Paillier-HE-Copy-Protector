/**
 * High-level encryption service that coordinates tokenization and encryption
 */

import { PaillierEncryption, type PaillierPublicKey } from './paillier';
import { KeyStorage } from './keyStorage';
import type { EncryptedDocument, EncryptedToken } from '../types';

export class EncryptionService {
  private keyStorage: KeyStorage;
  
  constructor() {
    this.keyStorage = new KeyStorage();
  }
  
  async init(): Promise<void> {
    await this.keyStorage.init();
  }
  
  /**
   * Encrypt tokens with progress callback
   */
  async encryptTokens(
    tokens: number[],
    publicKey: PaillierPublicKey,
    onProgress?: (progress: number) => void
  ): Promise<EncryptedToken[]> {
    const paillier = new PaillierEncryption(publicKey);
    const encryptedTokens: EncryptedToken[] = [];
    const total = tokens.length;
    
    // Process in batches to avoid blocking UI
    const batchSize = 10;
    
    for (let i = 0; i < total; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      
      // Encrypt batch
      const encryptedBatch = batch.map((token, batchIndex) => {
        const encrypted = paillier.encrypt(BigInt(token));
        const serialized = this.serializeBigInt(encrypted);
        
        return {
          value: this.uint8ArrayToBase64(serialized),
          index: i + batchIndex,
        };
      });
      
      encryptedTokens.push(...encryptedBatch);
      
      // Report progress
      if (onProgress) {
        const progress = Math.min(100, Math.round(((i + batch.length) / total) * 100));
        onProgress(progress);
      }
      
      // Yield to UI thread
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    return encryptedTokens;
  }
  
  /**
   * Create an encrypted document
   */
  async createEncryptedDocument(
    docId: string,
    tokens: number[],
    publicKey: PaillierPublicKey,
    onProgress?: (progress: number) => void
  ): Promise<EncryptedDocument> {
    const encryptedTokens = await this.encryptTokens(tokens, publicKey, onProgress);
    
    return {
      id: docId,
      encryptedTokens,
      metadata: {
        tokenCount: tokens.length,
        originalLength: 0, // Set by caller if needed
        timestamp: Date.now(),
        publicKey: {
          n: publicKey.n.toString(),
          g: publicKey.g.toString()
        }
      },
    };
  }
  
  /**
   * Convert tokens to format expected by canister
   * The canister expects 32-byte arrays for each token
   */
  prepareTokensForCanister(tokens: number[]): Uint8Array[] {
    return tokens.map(token => {
      const bytes = new Uint8Array(32);
      
      // Convert token to bytes (little-endian)
      let value = token;
      for (let i = 0; i < 4; i++) {
        bytes[i] = value & 0xFF;
        value = value >>> 8;
      }
      
      // Rest of bytes are zero-padded
      return bytes;
    });
  }
  
  /**
   * Convert encrypted tokens to canister format
   */
  encryptedTokensToCanisterFormat(encryptedTokens: EncryptedToken[]): Uint8Array[] {
    return encryptedTokens.map(token => {
      return this.base64ToUint8Array(token.value);
    });
  }
  
  /**
   * Store a public key
   */
  async storePublicKey(name: string, publicKey: PaillierPublicKey): Promise<string> {
    return this.keyStorage.storeKey(name, publicKey);
  }
  
  /**
   * Get all stored keys
   */
  async getStoredKeys() {
    return this.keyStorage.getAllKeys();
  }
  
  /**
   * Get a specific key
   */
  async getPublicKey(id: string): Promise<PaillierPublicKey | null> {
    const stored = await this.keyStorage.getKey(id);
    if (!stored) return null;
    return KeyStorage.toPaillierPublicKey(stored);
  }
  
  /**
   * Import a public key from the canister format
   */
  async importPublicKeyFromCanister(
    name: string,
    nBytes: Uint8Array,
    gBytes: Uint8Array
  ): Promise<string> {
    const publicKey = PaillierEncryption.parsePublicKey(nBytes, gBytes);
    return this.storePublicKey(name, publicKey);
  }
  
  // Utility methods
  
  private serializeBigInt(value: bigint): Uint8Array {
    const hex = value.toString(16);
    const paddedHex = hex.padStart(Math.ceil(hex.length / 2) * 2, '0');
    const bytes = new Uint8Array(paddedHex.length / 2);
    
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(paddedHex.substr(i * 2, 2), 16);
    }
    
    return bytes;
  }
  
  private uint8ArrayToBase64(bytes: Uint8Array): string {
    const binary = String.fromCharCode(...bytes);
    return btoa(binary);
  }
  
  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    return bytes;
  }
}