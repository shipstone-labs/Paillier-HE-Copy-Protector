# vetKeys Integration Guide for Paillier POC

## Overview

This guide documents the integration of vetKeys (threshold key derivation) with the Paillier homomorphic encryption POC on the Internet Computer. vetKeys enables secure, deterministic key derivation without storing keys in canister state.

---

## Architecture Changes

### Before (Phase 3)
```
┌─────────────────┐
│   Canister      │
│  ┌───────────┐  │
│  │ Paillier  │  │ ← Single key stored in state
│  │ Instance  │  │
│  └───────────┘  │
│  ┌───────────┐  │
│  │ Documents │  │
│  └───────────┘  │
└─────────────────┘
```

### After (vetKeys Integration)
```
┌─────────────────┐     ┌──────────────────┐
│   Canister      │────►│ Management       │
│  ┌───────────┐  │     │ Canister         │
│  │ No Keys!  │  │     │ ┌──────────────┐ │
│  └───────────┘  │     │ │   vetKeys    │ │
│  ┌───────────┐  │◄────│ │ Derivation   │ │
│  │Key Cache  │  │     │ └──────────────┘ │
│  └───────────┘  │     └──────────────────┘
│  ┌───────────┐  │
│  │ Documents │  │
│  └───────────┘  │
└─────────────────┘
```

---

## Key Components

### 1. vetKeys Check Module (`vetkd_check.rs`)
Verifies vetKeys availability on the subnet:
```rust
#[update]
pub async fn check_vetkd_support() -> Result<bool, String>
```

### 2. vetKeys Utils Module (`vetkd_utils.rs`)
Handles key derivation with caching:
- `VetKeyManager` - Main key management interface
- `KeySource` enum - Tracks key origin (VetKeys/Cached/Fallback)
- LRU cache for derived keys (5-minute TTL)
- Security event logging
- Performance metrics

### 3. Updated Paillier Module (`simple_paillier_vetkd.rs`)
Adds deterministic key generation:
```rust
pub fn from_seed(seed: &[u8], bits: usize) -> Self
```

### 4. Modified Canister State
- Removed persistent Paillier instance
- Added initialization tracking
- Added legacy mode support for migration

---

## API Changes

### New Endpoints

#### `check_vetkd_support() -> Result<bool, String>`
Check if vetKeys is available on the current subnet.

#### `get_vetkd_info() -> Result<String, String>`
Get detailed vetKeys configuration information.

#### `get_vetkd_metrics() -> VetKeyMetrics`
Query vetKeys performance metrics:
```rust
struct VetKeyMetrics {
    key_derivations: u64,
    cache_hits: u64,
    cache_misses: u64,
    total_derivation_time: u64,
    fallback_uses: u64,
    derivation_times: Vec<u64>,
}
```

#### `batch_encrypt_documents(ops: Vec<(String, Vec<Vec<u8>>)>) -> Vec<EncryptResult>`
Encrypt multiple documents in a single call (max 10).

#### `migrate_document(doc_id: String) -> Result<String, String>`
Mark document for migration from legacy to vetKeys encryption.

#### `clear_vetkd_cache() -> String`
Clear the key cache (owner only).

### Modified Endpoints

#### `initialize_paillier()` 
Now async, initializes vetKeys manager instead of generating keys.

#### `encrypt_document()`
Derives document-specific key on-demand instead of using stored key.

---

## Performance Characteristics

### Key Derivation Overhead
- First derivation: ~100-200ms
- Cached access: <1ms
- Cache capacity: 100 keys
- Cache TTL: 5 minutes

### Instruction Usage
- vetKeys derivation: +1-2M instructions
- Reduced token limit: 40 (from 50)
- Safety margin: 4B instructions (from 4.5B)

### Memory Usage
- No persistent key storage
- Cache overhead: ~10KB for 100 keys
- Paillier instance cache: ~50KB for 20 instances

---

## Deployment Guide

### 1. Check Prerequisites
```bash
# Verify dfx version supports vetKeys
dfx --version  # Should be 0.15.0+

# Check subnet capabilities
dfx canister call paillier_poc_backend check_vetkd_support
```

### 2. Deploy with vetKeys
```bash
# Deploy canister
./deploy.sh

# Initialize with vetKeys
dfx canister call paillier_poc_backend initialize_paillier

# Verify vetKeys mode
dfx canister call paillier_poc_backend get_vetkd_info
```

### 3. Run Integration Tests
```bash
# Run comprehensive test suite
./test_vetkd_integration.sh

# Monitor performance
node monitor_performance_vetkd.js
```

---

## Migration from Phase 3

### For Existing Documents

1. Deploy new canister version with vetKeys support
2. For each existing document:
   ```bash
   dfx canister call paillier_poc_backend migrate_document '("doc_id")'
   ```
3. Re-encrypt documents to complete migration

### Code Migration

Replace:
```rust
// Old: Single Paillier instance
let paillier = state.paillier.as_ref().unwrap();
```

With:
```rust
// New: Document-specific key derivation
let paillier = get_paillier_for_document(&doc_id).await?;
```

---

## Monitoring & Debugging

### Performance Monitoring
```javascript
// Key metrics to track
- Cache hit rate (target: >80%)
- Average derivation time (<200ms)
- Fallback usage (should be 0 in production)
- Instruction usage per operation
```

### Common Issues

1. **"vetKeys not available"**
   - Subnet doesn't support vetKeys
   - Solution: Use fallback mode or different subnet

2. **Low cache hit rate**
   - Too many unique documents
   - Solution: Increase cache size or TTL

3. **High derivation time**
   - Network latency to management canister
   - Solution: Batch operations when possible

---

## Security Considerations

### Improvements
- ✅ No key material in canister state
- ✅ Automatic key rotation via derivation
- ✅ Document-specific keys
- ✅ Audit logging for all key operations

### Remaining Limitations
- ⚠️ SimplePaillier still insecure (POC only)
- ⚠️ Deterministic randomness
- ⚠️ No threshold signatures yet
- ⚠️ Cache timing attacks possible

---

## Future Enhancements

### Phase 5: Production Readiness
1. Replace SimplePaillier with secure implementation
2. Add threshold signature support
3. Implement secure multi-party computation
4. External randomness beacon integration

### Phase 6: Advanced Features
1. Identity-based encryption (IBE)
2. Proxy re-encryption
3. Zero-knowledge proofs
4. Cross-canister key sharing

---

## Troubleshooting

### Enable Debug Logging
```rust
ic_cdk::println!("Debug: {}", message);
```

### Check Cache Status
```bash
dfx canister call paillier_poc_backend get_vetkd_metrics
```

### Force Cache Clear
```bash
dfx canister call paillier_poc_backend clear_vetkd_cache
```

### Verify Fallback Mode
Check logs for "WARNING: Using fallback key generation"

---

## Resources

- [IC vetKeys Documentation](https://internetcomputer.org/docs/current/developer-docs/integrations/vetkeys/)
- [vetKeys Specification](https://internetcomputer.org/docs/current/references/vetkeys-primer/)
- [IC Forum - vetKeys Discussion](https://forum.dfinity.org/t/vetkeys)
- [Example Implementations](https://github.com/dfinity/examples/tree/master/rust/vetkd)