use ic_cdk_macros::*;
use ic_cdk::api::{time, instruction_counter, caller};
use candid::{CandidType, Deserialize, Principal};
use num_bigint::BigUint;
use std::cell::RefCell;
use serde::Serialize;

mod simple_paillier;
use simple_paillier::SimplePaillier;

// ===== CONSTANTS FROM SPEC =====
const TOKEN_SIZE: usize = 32;
const KEY_SIZE: usize = 512; // For POC
const MAX_TOKENS: usize = 50; // Reduced for ICP safety
const MAX_DOCUMENTS: usize = 100; // Memory limit
const INSTRUCTION_LIMIT_SAFETY: u64 = 4_500_000_000; // 90% of query limit (improved from 80%)

// ===== ERROR TYPES =====
#[derive(CandidType, Deserialize, Debug)]
pub enum PaillierError {
    NotInitialized,
    AlreadyInitialized,
    KeyGenerationFailed(String),
    EncryptionFailed(String),
    InvalidTokenSize { expected: usize, got: usize },
    TooManyTokens { provided: usize, max: usize },
    DocumentNotFound(String),
    DocumentCountMismatch,
    InstructionLimitExceeded { used: u64, limit: u64 },
    MemoryLimitExceeded,
    InvalidInput(String),
}

// ===== STATE MANAGEMENT =====
thread_local! {
    static STATE: RefCell<CanisterState> = RefCell::new(CanisterState::new());
    
    // Performance metrics
    static METRICS: RefCell<PerformanceMetrics> = RefCell::new(PerformanceMetrics::default());
}

#[derive(Default)]
struct CanisterState {
    paillier: Option<SimplePaillier>,
    encrypted_docs: Vec<(String, Vec<Vec<u8>>)>, // (doc_id, encrypted_tokens)
    owner: Option<Principal>, // For access control
}

#[derive(Default)]
struct PerformanceMetrics {
    total_operations: u64,
    total_instructions_used: u64,
    encryption_operations: u64,
    comparison_operations: u64,
    failed_operations: u64,
}

impl CanisterState {
    fn new() -> Self {
        Self::default()
    }
}

// ===== API TYPES =====
#[derive(CandidType, Deserialize, Serialize)]
pub struct InitResult {
    pub success: bool,
    pub message: String,
    pub key_generation_ms: u64,
    pub instructions_used: u64,
    pub memory_used_kb: u64,
}

#[derive(CandidType, Deserialize, Serialize)]
pub struct EncryptResult {
    pub success: bool,
    pub doc_id: String,
    pub tokens_encrypted: usize,
    pub time_ms: u64,
    pub instructions_used: u64,
    pub memory_used_kb: u64,
    pub error: Option<String>,
}

#[derive(CandidType, Deserialize, Serialize)]
pub struct CompareResult {
    pub success: bool,
    pub similarity_score: Option<Vec<u8>>, // Encrypted result
    pub time_ms: u64,
    pub instructions_used: u64,
    pub instruction_percentage: f32, // % of limit used
    pub error: Option<String>,
}

#[derive(CandidType, Deserialize, Serialize)]
pub struct CanisterStats {
    pub total_operations: u64,
    pub total_instructions: u64,
    pub documents_stored: usize,
    pub memory_used_mb: f64,
    pub encryption_operations: u64,
    pub comparison_operations: u64,
    pub failed_operations: u64,
    pub owner: Option<String>,
}

// ===== CUSTOM GETRANDOM FOR ICP =====
// ICP doesn't have system randomness, must implement deterministic version
fn custom_getrandom(dest: &mut [u8]) -> Result<(), getrandom::Error> {
    // Use IC time and instruction counter for deterministic randomness
    // WARNING: This is NOT cryptographically secure - POC only
    let time_bytes = time().to_be_bytes();
    let counter_bytes = instruction_counter().to_be_bytes();
    let caller_bytes = caller().as_slice();
    
    // Safety check for empty caller (improvement from review)
    if caller_bytes.is_empty() {
        return Err(getrandom::Error::CUSTOM_START);
    }
    
    for (i, byte) in dest.iter_mut().enumerate() {
        *byte = time_bytes[i % 8] 
            ^ counter_bytes[i % 8] 
            ^ caller_bytes[i % caller_bytes.len()]
            ^ (i as u8);
    }
    
    Ok(())
}

// Register custom RNG on canister init
getrandom::register_custom_getrandom!(custom_getrandom);

// ===== HELPER FUNCTIONS =====
fn get_memory_usage_kb() -> u64 {
    // Improved memory estimation including BigUint allocations
    STATE.with(|state| {
        let state = state.borrow();
        let doc_memory: usize = state.encrypted_docs.iter()
            .map(|(id, tokens)| {
                // Each encrypted token is ~256 bytes for 512-bit keys
                id.len() + tokens.len() * 256
            })
            .sum();
        (doc_memory / 1024) as u64
    })
}

fn check_instruction_limit() -> Result<(), PaillierError> {
    let used = instruction_counter();
    if used > INSTRUCTION_LIMIT_SAFETY {
        Err(PaillierError::InstructionLimitExceeded { 
            used, 
            limit: INSTRUCTION_LIMIT_SAFETY 
        })
    } else {
        Ok(())
    }
}

// Input validation for document IDs (improvement from review)
fn validate_doc_id(doc_id: &str) -> Result<(), PaillierError> {
    if doc_id.is_empty() {
        return Err(PaillierError::InvalidInput("Doc ID cannot be empty".into()));
    }
    if doc_id.len() > 64 {
        return Err(PaillierError::InvalidInput("Doc ID too long (max 64 chars)".into()));
    }
    if !doc_id.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
        return Err(PaillierError::InvalidInput("Invalid characters in doc ID (use alphanumeric, _, -)".into()));
    }
    Ok(())
}

// ===== CANISTER LIFECYCLE =====
#[init]
fn init() {
    ic_cdk::println!("Paillier POC Canister initialized");
    ic_cdk::println!("Version: 0.1.0");
    ic_cdk::println!("Max tokens per document: {}", MAX_TOKENS);
    
    // Set owner to deployer
    STATE.with(|state| {
        state.borrow_mut().owner = Some(caller());
    });
}

#[pre_upgrade]
fn pre_upgrade() {
    // In production, would serialize state to stable memory
    ic_cdk::println!("Pre-upgrade: Would save state to stable memory");
}

#[post_upgrade]
fn post_upgrade() {
    // In production, would deserialize state from stable memory
    ic_cdk::println!("Post-upgrade: Would restore state from stable memory");
    init();
}

// ===== UPDATE METHODS =====
#[update]
fn initialize_paillier() -> InitResult {
    let start_time = time() / 1_000_000; // Convert to ms
    let start_instructions = instruction_counter();
    
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        
        // Check if already initialized
        if state.paillier.is_some() {
            return InitResult {
                success: false,
                message: "Already initialized".to_string(),
                key_generation_ms: 0,
                instructions_used: 0,
                memory_used_kb: get_memory_usage_kb(),
            };
        }
        
        // Generate keypair with error handling
        ic_cdk::println!("Generating {}-bit keypair...", KEY_SIZE);
        
        match std::panic::catch_unwind(|| SimplePaillier::new(KEY_SIZE)) {
            Ok(paillier) => {
                state.paillier = Some(paillier);
                
                let end_time = time() / 1_000_000;
                let instructions_used = instruction_counter() - start_instructions;
                
                METRICS.with(|metrics| {
                    let mut m = metrics.borrow_mut();
                    m.total_operations += 1;
                    m.total_instructions_used += instructions_used;
                });
                
                ic_cdk::println!("Key generation successful");
                
                InitResult {
                    success: true,
                    message: format!("Paillier initialized with {}-bit keys", KEY_SIZE),
                    key_generation_ms: end_time - start_time,
                    instructions_used,
                    memory_used_kb: get_memory_usage_kb(),
                }
            }
            Err(e) => {
                let error_msg = format!("Key generation panic: {:?}", e);
                ic_cdk::println!("Error: {}", error_msg);
                
                METRICS.with(|metrics| {
                    metrics.borrow_mut().failed_operations += 1;
                });
                
                InitResult {
                    success: false,
                    message: error_msg,
                    key_generation_ms: 0,
                    instructions_used: instruction_counter() - start_instructions,
                    memory_used_kb: get_memory_usage_kb(),
                }
            }
        }
    })
}

#[update]
fn encrypt_document(doc_id: String, tokens: Vec<Vec<u8>>) -> EncryptResult {
    let start_time = time() / 1_000_000;
    let start_instructions = instruction_counter();
    
    // Input validation with improved function
    if let Err(e) = validate_doc_id(&doc_id) {
        return EncryptResult {
            success: false,
            doc_id,
            tokens_encrypted: 0,
            time_ms: 0,
            instructions_used: instruction_counter() - start_instructions,
            memory_used_kb: get_memory_usage_kb(),
            error: Some(format!("Invalid doc ID: {:?}", e)),
        };
    }
    
    if tokens.len() > MAX_TOKENS {
        return EncryptResult {
            success: false,
            doc_id,
            tokens_encrypted: 0,
            time_ms: 0,
            instructions_used: instruction_counter() - start_instructions,
            memory_used_kb: get_memory_usage_kb(),
            error: Some(format!("Too many tokens: {} > {}", tokens.len(), MAX_TOKENS)),
        };
    }
    
    // Validate token sizes
    for (i, token) in tokens.iter().enumerate() {
        if token.len() != TOKEN_SIZE {
            return EncryptResult {
                success: false,
                doc_id,
                tokens_encrypted: 0,
                time_ms: 0,
                instructions_used: instruction_counter() - start_instructions,
                memory_used_kb: get_memory_usage_kb(),
                error: Some(format!("Token {} has wrong size: {} bytes (expected {})", 
                    i, token.len(), TOKEN_SIZE)),
            };
        }
    }
    
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        
        // Check document limit
        if state.encrypted_docs.len() >= MAX_DOCUMENTS {
            return EncryptResult {
                success: false,
                doc_id,
                tokens_encrypted: 0,
                time_ms: 0,
                instructions_used: instruction_counter() - start_instructions,
                memory_used_kb: get_memory_usage_kb(),
                error: Some(format!("Document limit reached: {}", MAX_DOCUMENTS)),
            };
        }
        
        // Check if initialized
        let paillier = match &state.paillier {
            Some(p) => p,
            None => {
                METRICS.with(|m| m.borrow_mut().failed_operations += 1);
                return EncryptResult {
                    success: false,
                    doc_id,
                    tokens_encrypted: 0,
                    time_ms: 0,
                    instructions_used: instruction_counter() - start_instructions,
                    memory_used_kb: get_memory_usage_kb(),
                    error: Some("Paillier not initialized".to_string()),
                }
            }
        };
        
        // Encrypt tokens with instruction monitoring
        let mut encrypted_tokens = Vec::with_capacity(tokens.len());
        
        for (i, token) in tokens.iter().enumerate() {
            // Check instruction limit every 5 tokens
            if i % 5 == 0 {
                if let Err(e) = check_instruction_limit() {
                    METRICS.with(|m| m.borrow_mut().failed_operations += 1);
                    return EncryptResult {
                        success: false,
                        doc_id,
                        tokens_encrypted: i,
                        time_ms: (time() / 1_000_000) - start_time,
                        instructions_used: instruction_counter() - start_instructions,
                        memory_used_kb: get_memory_usage_kb(),
                        error: Some(format!("Instruction limit exceeded at token {}: {:?}", i, e)),
                    };
                }
            }
            
            match paillier.encrypt(token) {
                Ok(encrypted) => {
                    encrypted_tokens.push(encrypted.to_bytes_be());
                }
                Err(e) => {
                    METRICS.with(|m| m.borrow_mut().failed_operations += 1);
                    return EncryptResult {
                        success: false,
                        doc_id,
                        tokens_encrypted: i,
                        time_ms: (time() / 1_000_000) - start_time,
                        instructions_used: instruction_counter() - start_instructions,
                        memory_used_kb: get_memory_usage_kb(),
                        error: Some(format!("Encryption failed at token {}: {}", i, e)),
                    }
                }
            }
        }
        
        // Store encrypted document (replace if exists)
        state.encrypted_docs.retain(|(id, _)| id != &doc_id);
        state.encrypted_docs.push((doc_id.clone(), encrypted_tokens));
        
        let end_time = time() / 1_000_000;
        let total_instructions = instruction_counter() - start_instructions;
        
        METRICS.with(|metrics| {
            let mut m = metrics.borrow_mut();
            m.total_operations += 1;
            m.encryption_operations += 1;
            m.total_instructions_used += total_instructions;
        });
        
        ic_cdk::println!("Encrypted {} tokens for document '{}'", tokens.len(), doc_id);
        
        EncryptResult {
            success: true,
            doc_id,
            tokens_encrypted: tokens.len(),
            time_ms: end_time - start_time,
            instructions_used: total_instructions,
            memory_used_kb: get_memory_usage_kb(),
            error: None,
        }
    })
}

#[update]
fn compare_documents(doc_id1: String, doc_id2: String) -> CompareResult {
    let start_time = time() / 1_000_000;
    let start_instructions = instruction_counter();
    
    // Validate both document IDs
    if let Err(e) = validate_doc_id(&doc_id1) {
        return CompareResult {
            success: false,
            similarity_score: None,
            time_ms: 0,
            instructions_used: instruction_counter() - start_instructions,
            instruction_percentage: 0.0,
            error: Some(format!("Invalid doc_id1: {:?}", e)),
        };
    }
    
    if let Err(e) = validate_doc_id(&doc_id2) {
        return CompareResult {
            success: false,
            similarity_score: None,
            time_ms: 0,
            instructions_used: instruction_counter() - start_instructions,
            instruction_percentage: 0.0,
            error: Some(format!("Invalid doc_id2: {:?}", e)),
        };
    }
    
    STATE.with(|state| {
        let state = state.borrow();
        
        // Check if initialized
        let paillier = match &state.paillier {
            Some(p) => p,
            None => {
                METRICS.with(|m| m.borrow_mut().failed_operations += 1);
                return CompareResult {
                    success: false,
                    similarity_score: None,
                    time_ms: 0,
                    instructions_used: instruction_counter() - start_instructions,
                    instruction_percentage: 0.0,
                    error: Some("Paillier not initialized".to_string()),
                }
            }
        };
        
        // Find documents
        let doc1 = state.encrypted_docs.iter()
            .find(|(id, _)| id == &doc_id1)
            .map(|(_, tokens)| tokens);
        let doc2 = state.encrypted_docs.iter()
            .find(|(id, _)| id == &doc_id2)
            .map(|(_, tokens)| tokens);
        
        match (doc1, doc2) {
            (Some(tokens1), Some(tokens2)) => {
                if tokens1.len() != tokens2.len() {
                    METRICS.with(|m| m.borrow_mut().failed_operations += 1);
                    return CompareResult {
                        success: false,
                        similarity_score: None,
                        time_ms: 0,
                        instructions_used: instruction_counter() - start_instructions,
                        instruction_percentage: 0.0,
                        error: Some(format!("Documents have different token counts: {} vs {}", 
                            tokens1.len(), tokens2.len())),
                    };
                }
                
                ic_cdk::println!("Comparing {} tokens between '{}' and '{}'", 
                    tokens1.len(), doc_id1, doc_id2);
                
                // Perform homomorphic comparison
                let mut accumulated_diff = None;
                
                for (i, (enc1_bytes, enc2_bytes)) in tokens1.iter().zip(tokens2.iter()).enumerate() {
                    // Check instructions every 3 tokens
                    if i % 3 == 0 {
                        if let Err(e) = check_instruction_limit() {
                            METRICS.with(|m| m.borrow_mut().failed_operations += 1);
                            let used = instruction_counter() - start_instructions;
                            return CompareResult {
                                success: false,
                                similarity_score: None,
                                time_ms: (time() / 1_000_000) - start_time,
                                instructions_used: used,
                                instruction_percentage: (used as f32 / INSTRUCTION_LIMIT_SAFETY as f32) * 100.0,
                                error: Some(format!("Instruction limit exceeded at token {}: {:?}", i, e)),
                            };
                        }
                    }
                    
                    // Convert back to BigUint
                    let enc1 = BigUint::from_bytes_be(enc1_bytes);
                    let enc2 = BigUint::from_bytes_be(enc2_bytes);
                    
                    // Add encrypted values (represents difference in our simplified scheme)
                    let diff = paillier.add(&enc1, &enc2);
                    
                    // Accumulate differences
                    accumulated_diff = Some(match accumulated_diff {
                        None => diff,
                        Some(acc) => paillier.add(&acc, &diff),
                    });
                }
                
                let end_time = time() / 1_000_000;
                let total_instructions = instruction_counter() - start_instructions;
                let instruction_percentage = (total_instructions as f32 / INSTRUCTION_LIMIT_SAFETY as f32) * 100.0;
                
                METRICS.with(|metrics| {
                    let mut m = metrics.borrow_mut();
                    m.total_operations += 1;
                    m.comparison_operations += 1;
                    m.total_instructions_used += total_instructions;
                });
                
                ic_cdk::println!("Comparison completed in {}ms using {}% of instruction limit", 
                    end_time - start_time, instruction_percentage);
                
                CompareResult {
                    success: true,
                    similarity_score: accumulated_diff.map(|d| d.to_bytes_be()),
                    time_ms: end_time - start_time,
                    instructions_used: total_instructions,
                    instruction_percentage,
                    error: None,
                }
            }
            (None, _) => {
                METRICS.with(|m| m.borrow_mut().failed_operations += 1);
                CompareResult {
                    success: false,
                    similarity_score: None,
                    time_ms: 0,
                    instructions_used: instruction_counter() - start_instructions,
                    instruction_percentage: 0.0,
                    error: Some(format!("Document '{}' not found", doc_id1)),
                }
            }
            (_, None) => {
                METRICS.with(|m| m.borrow_mut().failed_operations += 1);
                CompareResult {
                    success: false,
                    similarity_score: None,
                    time_ms: 0,
                    instructions_used: instruction_counter() - start_instructions,
                    instruction_percentage: 0.0,
                    error: Some(format!("Document '{}' not found", doc_id2)),
                }
            }
        }
    })
}

// ===== QUERY METHODS =====
#[query]
fn get_stats() -> CanisterStats {
    STATE.with(|state| {
        let state = state.borrow();
        
        METRICS.with(|metrics| {
            let m = metrics.borrow();
            
            // Calculate memory usage with improved estimation
            let encrypted_token_size = 256; // bytes for 512-bit keys
            let total_tokens: usize = state.encrypted_docs.iter()
                .map(|(_, tokens)| tokens.len())
                .sum();
            let memory_used_mb = (total_tokens * encrypted_token_size) as f64 / 1_048_576.0;
            
            CanisterStats {
                total_operations: m.total_operations,
                total_instructions: m.total_instructions_used,
                documents_stored: state.encrypted_docs.len(),
                memory_used_mb,
                encryption_operations: m.encryption_operations,
                comparison_operations: m.comparison_operations,
                failed_operations: m.failed_operations,
                owner: state.owner.map(|p| p.to_string()),
            }
        })
    })
}

#[query]
fn list_documents() -> Vec<(String, usize)> {
    STATE.with(|state| {
        state.borrow()
            .encrypted_docs
            .iter()
            .map(|(id, tokens)| (id.clone(), tokens.len()))
            .collect()
    })
}

#[query]
fn health_check() -> String {
    let initialized = STATE.with(|s| s.borrow().paillier.is_some());
    let doc_count = STATE.with(|s| s.borrow().encrypted_docs.len());
    let memory_kb = get_memory_usage_kb();
    
    format!(
        "Status: {}, Documents: {}, Memory: {}KB", 
        if initialized { "Ready" } else { "Not initialized" },
        doc_count,
        memory_kb
    )
}

// ===== ADMIN METHODS =====
#[update]
fn clear_all_documents() -> String {
    let caller = caller();
    
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        
        // Check owner
        if state.owner != Some(caller) {
            return format!("Unauthorized: only owner can clear documents");
        }
        
        let count = state.encrypted_docs.len();
        state.encrypted_docs.clear();
        
        METRICS.with(|m| m.borrow_mut().total_operations += 1);
        
        format!("Cleared {} documents", count)
    })
}

// Export Candid interface
ic_cdk::export_candid!();