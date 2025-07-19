use ic_cdk::api::{time, management_canister::main::*, caller};
use candid::{CandidType, Deserialize, Principal};
use lru::LruCache;
use std::cell::RefCell;
use std::num::NonZeroUsize;
use serde::Serialize;

const KEY_CACHE_TTL: u64 = 5 * 60 * 1_000_000_000; // 5 minutes in nanoseconds
const CACHE_SIZE: usize = 100; // Max cached keys

thread_local! {
    static KEY_CACHE: RefCell<LruCache<String, (u64, Vec<u8>)>> = 
        RefCell::new(LruCache::new(NonZeroUsize::new(CACHE_SIZE).unwrap()));
}

#[derive(Debug, Clone, CandidType, Deserialize, Serialize)]
pub enum KeySource {
    VetKeys(Vec<u8>),
    Cached(Vec<u8>),
    Fallback(Vec<u8>), // For testing when vetKeys unavailable
}

#[derive(Clone)]
pub struct VetKeyManager {
    key_name: String,
    fallback_enabled: bool,
}

impl VetKeyManager {
    pub async fn new(fallback_enabled: bool) -> Result<Self, String> {
        ic_cdk::println!("Initializing VetKeyManager with fallback={}", fallback_enabled);
        Ok(Self {
            key_name: "paillier_fhe_key".to_string(),
            fallback_enabled,
        })
    }
    
    /// Derive an encryption key with caching support
    pub async fn derive_encryption_key_with_cache(
        &self,
        doc_id: &str
    ) -> Result<KeySource, String> {
        let cache_key = format!("doc:{}", doc_id);
        let now = time();
        
        // Check cache first
        let cached = KEY_CACHE.with(|cache| {
            cache.borrow_mut().get(&cache_key).cloned()
        });
        
        if let Some((timestamp, key)) = cached {
            if now - timestamp < KEY_CACHE_TTL {
                ic_cdk::println!("Key cache hit for {}", doc_id);
                
                // Update metrics
                update_cache_hit_metrics();
                
                return Ok(KeySource::Cached(key));
            } else {
                ic_cdk::println!("Cache expired for {}", doc_id);
            }
        }
        
        // Cache miss - derive new key
        update_cache_miss_metrics();
        
        // Try vetKeys derivation
        match self.derive_from_vetkd(doc_id).await {
            Ok(key) => {
                // Cache the derived key
                KEY_CACHE.with(|cache| {
                    cache.borrow_mut().put(cache_key, (now, key.clone()));
                });
                
                ic_cdk::println!("Successfully derived vetKey for {}", doc_id);
                Ok(KeySource::VetKeys(key))
            }
            Err(e) => {
                if self.fallback_enabled && e.contains("not available") {
                    ic_cdk::println!("WARNING: Using fallback key generation for {}", doc_id);
                    update_fallback_metrics();
                    Ok(KeySource::Fallback(self.generate_fallback_key(doc_id)))
                } else {
                    Err(e)
                }
            }
        }
    }
    
    /// Clear the key cache (useful for testing)
    pub fn clear_cache() {
        KEY_CACHE.with(|cache| {
            cache.borrow_mut().clear();
        });
        ic_cdk::println!("Key cache cleared");
    }
    
    /// Get cache statistics
    pub fn get_cache_stats() -> CacheStats {
        KEY_CACHE.with(|cache| {
            let cache = cache.borrow();
            CacheStats {
                size: cache.len(),
                capacity: cache.cap().get(),
            }
        })
    }
    
    async fn derive_from_vetkd(&self, doc_id: &str) -> Result<Vec<u8>, String> {
        let start_time = time();
        
        let derivation_path = vec![
            b"document".to_vec(),
            doc_id.as_bytes().to_vec(),
        ];
        
        let request = VetKdDeriveKeyRequest {
            key_id: vec![0; 32], // Default key ID
            derivation_path,
            encryption_public_key: None, // For future IBE support
        };
        
        let result = ic_cdk::call::<_, (VetKdDeriveKeyResponse,)>(
            Principal::management_canister(),
            "vetkd_derive_key",
            (request,)
        ).await;
        
        match result {
            Ok((response,)) => {
                let duration = (time() - start_time) / 1_000_000; // Convert to ms
                update_derivation_time_metrics(duration);
                ic_cdk::println!("Key derivation took {}ms", duration);
                Ok(response.derived_key)
            }
            Err((code, msg)) => {
                Err(format!("vetKD derivation failed: {:?} - {}", code, msg))
            }
        }
    }
    
    fn generate_fallback_key(&self, doc_id: &str) -> Vec<u8> {
        use sha2::{Sha256, Digest};
        
        let mut hasher = Sha256::new();
        hasher.update(b"fallback:");
        hasher.update(doc_id.as_bytes());
        hasher.update(&time().to_be_bytes());
        hasher.update(&caller().as_slice());
        
        let hash = hasher.finalize();
        
        // Extend to 64 bytes for key material
        let mut key = hash.to_vec();
        let mut hasher2 = Sha256::new();
        hasher2.update(&hash);
        hasher2.update(b"extended");
        key.extend_from_slice(&hasher2.finalize());
        
        key
    }
}

// ===== METRICS TRACKING =====

#[derive(Default, CandidType, Deserialize, Serialize)]
pub struct VetKeyMetrics {
    pub key_derivations: u64,
    pub cache_hits: u64,
    pub cache_misses: u64,
    pub total_derivation_time: u64,
    pub fallback_uses: u64,
    pub derivation_times: Vec<u64>, // Last 100 derivation times
}

thread_local! {
    static METRICS: RefCell<VetKeyMetrics> = RefCell::new(VetKeyMetrics::default());
}

pub fn get_vetkd_metrics() -> VetKeyMetrics {
    METRICS.with(|m| m.borrow().clone())
}

pub fn reset_metrics() {
    METRICS.with(|m| {
        *m.borrow_mut() = VetKeyMetrics::default();
    });
}

fn update_cache_hit_metrics() {
    METRICS.with(|m| {
        m.borrow_mut().cache_hits += 1;
    });
}

fn update_cache_miss_metrics() {
    METRICS.with(|m| {
        m.borrow_mut().cache_misses += 1;
    });
}

fn update_fallback_metrics() {
    METRICS.with(|m| {
        m.borrow_mut().fallback_uses += 1;
    });
}

fn update_derivation_time_metrics(duration_ms: u64) {
    METRICS.with(|m| {
        let mut metrics = m.borrow_mut();
        metrics.key_derivations += 1;
        metrics.total_derivation_time += duration_ms;
        
        // Keep last 100 times
        metrics.derivation_times.push(duration_ms);
        if metrics.derivation_times.len() > 100 {
            metrics.derivation_times.remove(0);
        }
    });
}

#[derive(CandidType, Deserialize, Serialize)]
pub struct CacheStats {
    pub size: usize,
    pub capacity: usize,
}

// ===== SECURITY LOGGING =====

#[derive(CandidType, Deserialize, Serialize)]
pub struct SecurityEvent {
    pub timestamp: u64,
    pub event_type: SecurityEventType,
    pub principal: Principal,
    pub details: String,
}

#[derive(CandidType, Deserialize, Serialize)]
pub enum SecurityEventType {
    KeyDerivation,
    CacheAccess,
    FallbackUsed,
    RateLimitExceeded,
    InvalidAccess,
}

thread_local! {
    static SECURITY_LOG: RefCell<Vec<SecurityEvent>> = RefCell::new(Vec::new());
}

pub fn log_security_event(event_type: SecurityEventType, details: String) {
    let event = SecurityEvent {
        timestamp: time(),
        event_type,
        principal: caller(),
        details,
    };
    
    SECURITY_LOG.with(|log| {
        let mut log = log.borrow_mut();
        log.push(event);
        
        // Keep only last 1000 events
        if log.len() > 1000 {
            log.drain(0..100);
        }
    });
}

pub fn get_security_log() -> Vec<SecurityEvent> {
    SECURITY_LOG.with(|log| log.borrow().clone())
}

// ===== BATCH OPERATIONS SUPPORT =====

/// Derive multiple keys in parallel (when available)
pub async fn batch_derive_keys(
    manager: &VetKeyManager,
    doc_ids: Vec<String>
) -> Vec<Result<KeySource, String>> {
    // For now, process sequentially
    // In future, could use futures::join_all for parallel processing
    let mut results = Vec::new();
    
    for doc_id in doc_ids {
        results.push(
            manager.derive_encryption_key_with_cache(&doc_id).await
        );
    }
    
    results
}