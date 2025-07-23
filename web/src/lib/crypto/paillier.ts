/**
 * Client-side Paillier encryption implementation
 * This matches the canister's implementation for compatibility
 * 
 * WARNING: This is a SIMPLIFIED implementation for POC only
 * DO NOT use in production - not cryptographically secure!
 */

export interface PaillierPublicKey {
  n: bigint;  // modulus
  g: bigint;  // generator (usually n + 1)
  n_squared: bigint; // n^2 precomputed
}

export interface PaillierKeyPair {
  publicKey: PaillierPublicKey;
  privateKey: {
    lambda: bigint;
    mu: bigint;
  };
}

export class PaillierEncryption {
  private publicKey: PaillierPublicKey;
  
  constructor(publicKey: PaillierPublicKey) {
    this.publicKey = publicKey;
  }
  
  /**
   * Generate a keypair (for testing/demo only)
   * In production, keys should be generated securely
   */
  static generateKeyPair(bitLength: number = 512): PaillierKeyPair {
    // This is a placeholder - in real implementation, you'd:
    // 1. Generate two large primes p and q
    // 2. Compute n = p * q
    // 3. Compute lambda = lcm(p-1, q-1)
    // 4. Compute mu = modInverse(lambda, n)
    
    throw new Error("Key generation should happen in secure environment, not in browser");
  }
  
  /**
   * Encrypt a single token (number)
   * @param plaintext The token value as bigint
   * @returns Encrypted value as bigint
   */
  encrypt(plaintext: bigint): bigint {
    const { n, g, n_squared } = this.publicKey;
    
    // Generate a random r where gcd(r, n) = 1
    // For POC, using simple deterministic "randomness"
    const r = this.generateR(plaintext);
    
    // c = g^m * r^n mod n^2
    const g_m = this.modPow(g, plaintext, n_squared);
    const r_n = this.modPow(r, n, n_squared);
    const ciphertext = (g_m * r_n) % n_squared;
    
    return ciphertext;
  }
  
  /**
   * Encrypt an array of tokens
   * @param tokens Array of token IDs from tokenizer
   * @returns Array of encrypted values
   */
  encryptTokens(tokens: number[]): bigint[] {
    return tokens.map(token => this.encrypt(BigInt(token)));
  }
  
  /**
   * Convert encrypted bigints to byte arrays for transmission
   * @param encryptedTokens Array of encrypted bigints
   * @returns Array of byte arrays
   */
  static serializeEncryptedTokens(encryptedTokens: bigint[]): Uint8Array[] {
    return encryptedTokens.map(token => {
      // Convert bigint to hex string, then to bytes
      const hex = token.toString(16);
      const paddedHex = hex.padStart(Math.ceil(hex.length / 2) * 2, '0');
      const bytes = new Uint8Array(paddedHex.length / 2);
      
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(paddedHex.substr(i * 2, 2), 16);
      }
      
      return bytes;
    });
  }
  
  /**
   * Parse public key from canister format
   * @param n_bytes The modulus n as byte array
   * @param g_bytes The generator g as byte array
   * @returns PaillierPublicKey
   */
  static parsePublicKey(n_bytes: Uint8Array, g_bytes: Uint8Array): PaillierPublicKey {
    const n = this.bytesToBigInt(n_bytes);
    const g = this.bytesToBigInt(g_bytes);
    const n_squared = n * n;
    
    return { n, g, n_squared };
  }
  
  /**
   * Generate deterministic "random" value for POC
   * NOT SECURE - only for testing
   */
  private generateR(plaintext: bigint): bigint {
    const { n } = this.publicKey;
    
    // Simple deterministic generation based on plaintext
    // In production, use crypto.getRandomValues()
    let r = (plaintext * BigInt(31415926535) + BigInt(2718281828)) % n;
    
    // Ensure r is coprime to n (for POC, just make it odd)
    if (r % 2n === 0n) {
      r = r + 1n;
    }
    
    return r;
  }
  
  /**
   * Modular exponentiation: base^exp mod modulus
   */
  private modPow(base: bigint, exp: bigint, modulus: bigint): bigint {
    let result = 1n;
    base = base % modulus;
    
    while (exp > 0n) {
      if (exp % 2n === 1n) {
        result = (result * base) % modulus;
      }
      exp = exp >> 1n;
      base = (base * base) % modulus;
    }
    
    return result;
  }
  
  /**
   * Convert byte array to bigint
   */
  private static bytesToBigInt(bytes: Uint8Array): bigint {
    let hex = '';
    for (const byte of bytes) {
      hex += byte.toString(16).padStart(2, '0');
    }
    return BigInt('0x' + hex);
  }
}