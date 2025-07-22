/**
 * Client-side Paillier key generation
 * WARNING: This is for DEMO/TESTING purposes only!
 * 
 * In production, key generation should happen in a secure environment
 * and use proper cryptographic libraries. This implementation is
 * educational and not suitable for real-world use.
 */

import type { PaillierPublicKey, PaillierKeyPair } from './paillier';

export class PaillierKeyGenerator {
  /**
   * Generate a random prime number of approximately the given bit length
   * Using Miller-Rabin primality test
   */
  private static async generatePrime(bits: number): Promise<bigint> {
    const iterations = 40; // Number of Miller-Rabin iterations
    
    while (true) {
      // Generate random odd number of the right size
      const candidate = await this.generateRandomBigInt(bits);
      
      // Make it odd
      const oddCandidate = candidate | 1n;
      
      // Test for primality
      if (await this.isProbablyPrime(oddCandidate, iterations)) {
        return oddCandidate;
      }
    }
  }
  
  /**
   * Generate a random bigint of the specified bit length using Web Crypto API
   */
  private static async generateRandomBigInt(bits: number): Promise<bigint> {
    const bytes = Math.ceil(bits / 8);
    const array = new Uint8Array(bytes);
    
    // Use Web Crypto API for secure randomness
    crypto.getRandomValues(array);
    
    // Convert to bigint
    let result = 0n;
    for (let i = 0; i < array.length; i++) {
      result = (result << 8n) | BigInt(array[i]);
    }
    
    // Ensure it has the right bit length
    const mask = (1n << BigInt(bits)) - 1n;
    result = result & mask;
    
    // Set the highest bit to ensure proper length
    result = result | (1n << BigInt(bits - 1));
    
    return result;
  }
  
  /**
   * Miller-Rabin primality test
   */
  private static async isProbablyPrime(n: bigint, k: number): Promise<boolean> {
    // Handle small cases
    if (n === 2n || n === 3n) return true;
    if (n < 2n || n % 2n === 0n) return false;
    
    // Write n-1 as d * 2^r
    let r = 0n;
    let d = n - 1n;
    while (d % 2n === 0n) {
      d = d / 2n;
      r = r + 1n;
    }
    
    // Witness loop
    for (let i = 0; i < k; i++) {
      const a = await this.generateRandomBigInt(Number(n.toString(2).length - 1));
      const witness = (a % (n - 2n)) + 2n; // Random in [2, n-2]
      
      let x = this.modPow(witness, d, n);
      
      if (x === 1n || x === n - 1n) continue;
      
      let continueWitnessLoop = false;
      for (let j = 0n; j < r - 1n; j++) {
        x = this.modPow(x, 2n, n);
        if (x === n - 1n) {
          continueWitnessLoop = true;
          break;
        }
      }
      
      if (!continueWitnessLoop) return false;
    }
    
    return true;
  }
  
  /**
   * Modular exponentiation
   */
  private static modPow(base: bigint, exp: bigint, mod: bigint): bigint {
    let result = 1n;
    base = base % mod;
    
    while (exp > 0n) {
      if (exp % 2n === 1n) {
        result = (result * base) % mod;
      }
      exp = exp >> 1n;
      base = (base * base) % mod;
    }
    
    return result;
  }
  
  /**
   * Greatest common divisor
   */
  private static gcd(a: bigint, b: bigint): bigint {
    while (b !== 0n) {
      const temp = b;
      b = a % b;
      a = temp;
    }
    return a;
  }
  
  /**
   * Least common multiple
   */
  private static lcm(a: bigint, b: bigint): bigint {
    return (a * b) / this.gcd(a, b);
  }
  
  /**
   * Modular multiplicative inverse using extended Euclidean algorithm
   */
  private static modInverse(a: bigint, m: bigint): bigint {
    let m0 = m;
    let x0 = 0n;
    let x1 = 1n;
    
    if (m === 1n) return 0n;
    
    while (a > 1n) {
      const q = a / m;
      let t = m;
      
      m = a % m;
      a = t;
      t = x0;
      
      x0 = x1 - q * x0;
      x1 = t;
    }
    
    if (x1 < 0n) x1 += m0;
    
    return x1;
  }
  
  /**
   * Generate a Paillier key pair
   * @param bitLength The bit length of the modulus (must be even)
   * @returns A complete Paillier key pair
   */
  static async generateKeyPair(bitLength: number = 512): Promise<PaillierKeyPair> {
    if (bitLength % 2 !== 0) {
      throw new Error('Bit length must be even');
    }
    
    if (bitLength < 512) {
      throw new Error('Bit length must be at least 512 for security');
    }
    
    const halfBits = bitLength / 2;
    
    // Generate two large primes p and q
    const p = await this.generatePrime(halfBits);
    const q = await this.generatePrime(halfBits);
    
    // Ensure p !== q
    if (p === q) {
      return this.generateKeyPair(bitLength);
    }
    
    // Calculate n = p * q
    const n = p * q;
    const n_squared = n * n;
    
    // Calculate lambda = lcm(p-1, q-1)
    const lambda = this.lcm(p - 1n, q - 1n);
    
    // Calculate g = n + 1 (simple choice that always works)
    const g = n + 1n;
    
    // Calculate mu = (L(g^lambda mod n^2))^-1 mod n
    // where L(x) = (x - 1) / n
    const g_lambda = this.modPow(g, lambda, n_squared);
    const l_value = (g_lambda - 1n) / n;
    const mu = this.modInverse(l_value, n);
    
    return {
      publicKey: {
        n,
        g,
        n_squared
      },
      privateKey: {
        lambda,
        mu
      }
    };
  }
  
  /**
   * Export public key to hex strings
   */
  static exportPublicKey(publicKey: PaillierPublicKey): { n: string; g: string } {
    return {
      n: publicKey.n.toString(16),
      g: publicKey.g.toString(16)
    };
  }
  
  /**
   * Export private key to hex strings (for backup purposes)
   * WARNING: Private keys should be handled with extreme care!
   */
  static exportPrivateKey(privateKey: { lambda: bigint; mu: bigint }): { lambda: string; mu: string } {
    return {
      lambda: privateKey.lambda.toString(16),
      mu: privateKey.mu.toString(16)
    };
  }
  
  /**
   * Export full key pair as JSON
   */
  static exportKeyPair(keyPair: PaillierKeyPair): string {
    const exported = {
      publicKey: this.exportPublicKey(keyPair.publicKey),
      privateKey: this.exportPrivateKey(keyPair.privateKey),
      warning: "This key was generated in the browser for DEMO purposes only. Do not use for production!",
      generatedAt: new Date().toISOString()
    };
    
    return JSON.stringify(exported, null, 2);
  }
}