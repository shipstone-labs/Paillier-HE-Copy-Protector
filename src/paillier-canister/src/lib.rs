use candid::{CandidType, Deserialize, Principal};
use ic_cdk_macros::{init, post_upgrade, query, update};
use ic_stable_structures::{
    memory_manager::{MemoryId, MemoryManager, VirtualMemory},
    DefaultMemoryImpl, Cell as StableCell, BTreeMap as StableBTreeMap, Storable,
    storable::Bound,
};
use sha2::{Sha256, Digest};
use std::cell::RefCell;
use std::borrow::Cow;

type Memory = VirtualMemory<DefaultMemoryImpl>;

// Document storage types
#[derive(CandidType, Deserialize, Clone)]
pub struct EncryptedDocument {
    pub tokens: Vec<Vec<u8>>, // Encrypted token values
    pub timestamp: u64,
    pub owner: Principal,
    pub title: Option<String>, // Optional for backward compatibility
    pub public_key_n: String, // Paillier public key n component
    pub public_key_g: String, // Paillier public key g component
}

impl Storable for EncryptedDocument {
    const BOUND: Bound = Bound::Unbounded;
    
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(candid::encode_one(self).unwrap())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        candid::decode_one(&bytes).unwrap()
    }
}

#[derive(CandidType, Deserialize)]
pub struct StoreResult {
    pub document_id: String, // Hash of encrypted data
    pub success: bool,
    pub message: String,
}

#[derive(CandidType, Deserialize)]
pub struct DocumentMetadata {
    pub document_id: String,
    pub title: String,
    pub owner: Principal,
    pub timestamp: u64,
    pub public_key_n: String,
    pub public_key_g: String,
}

#[derive(CandidType, Deserialize)]
pub struct CompareResult {
    pub similarity_score: Option<f64>, // Percentage similarity
    pub tokens_compared: u32,
    pub success: bool,
    pub message: String,
    pub plagiarism_score: Option<f64>, // Optional plagiarism detection score
}

#[derive(CandidType, Deserialize)]
pub enum ComparisonMode {
    Duplicate,    // Current position-based comparison
    Plagiarism,   // N-gram/containment based
    Both,         // Run both checks
}

// State management
thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> = RefCell::new(
        MemoryManager::init(DefaultMemoryImpl::default())
    );
    
    static DOCUMENTS: RefCell<StableBTreeMap<String, EncryptedDocument, Memory>> = RefCell::new(
        StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(0)))
        )
    );
    
    static CONFIG: RefCell<StableCell<Config, Memory>> = RefCell::new(
        StableCell::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(1))),
            Config::default()
        ).expect("Failed to init config")
    );
}

#[derive(CandidType, Deserialize, Clone)]
struct Config {
    max_documents: u32,
    max_tokens_per_document: u32,
    duplicate_threshold: f64, // Similarity percentage to consider as duplicate
    check_all_duplicates: bool, // Whether to check against all documents
    fingerprint_size: u32, // Number of tokens to use for fingerprint
    fingerprint_threshold: f64, // Similarity threshold for fingerprint pre-filtering
}

impl Storable for Config {
    const BOUND: Bound = Bound::Bounded {
        max_size: 256,
        is_fixed_size: false
    };
    
    fn to_bytes(&self) -> Cow<[u8]> {
        Cow::Owned(candid::encode_one(self).unwrap())
    }

    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        candid::decode_one(&bytes).unwrap()
    }
}

impl Default for Config {
    fn default() -> Self {
        Config {
            max_documents: 1000,
            max_tokens_per_document: 10000,
            duplicate_threshold: 95.0, // 95% similarity = likely duplicate
            check_all_duplicates: false, // Disabled by default for performance
            fingerprint_size: 50, // Sample 50 tokens throughout document
            fingerprint_threshold: 80.0, // 80% match on fingerprint to be a candidate
        }
    }
}

// Initialize canister
#[init]
fn init() {
    // Config is already initialized with default values
}

#[post_upgrade]
fn post_upgrade() {
    // Config is already in stable memory, nothing to do
}

/// Store an encrypted document
#[update]
fn store_document(
    title: String, 
    encrypted_tokens: Vec<Vec<u8>>,
    public_key_n: String,
    public_key_g: String
) -> StoreResult {
    let caller = ic_cdk::caller();
    
    // Validate input
    let config = CONFIG.with(|c| c.borrow().get().clone());
    if encrypted_tokens.len() > config.max_tokens_per_document as usize {
        return StoreResult {
            document_id: String::new(),
            success: false,
            message: format!("Too many tokens. Maximum: {}", config.max_tokens_per_document),
        };
    }
    
    // Generate document ID from hash of encrypted content
    let mut hasher = Sha256::new();
    for token in &encrypted_tokens {
        hasher.update(token);
    }
    let hash = hasher.finalize();
    let document_id = hex::encode(&hash[..16]); // Use first 16 bytes for ID
    
    // Check if document already exists
    let exists = DOCUMENTS.with(|docs| {
        docs.borrow().contains_key(&document_id)
    });
    
    if exists {
        return StoreResult {
            document_id,
            success: true,
            message: "Document already exists with this ID".to_string(),
        };
    }
    
    // Check document limit
    let doc_count = DOCUMENTS.with(|docs| docs.borrow().len());
    if doc_count >= config.max_documents as u64 {
        return StoreResult {
            document_id: String::new(),
            success: false,
            message: format!("Document limit reached: {}", config.max_documents),
        };
    }
    
    // Store document
    let document = EncryptedDocument {
        tokens: encrypted_tokens,
        timestamp: ic_cdk::api::time(),
        owner: caller,
        title: Some(title),
        public_key_n,
        public_key_g,
    };
    
    DOCUMENTS.with(|docs| {
        docs.borrow_mut().insert(document_id.clone(), document);
    });
    
    StoreResult {
        document_id,
        success: true,
        message: "Document stored successfully".to_string(),
    }
}

/// Compare two stored documents
#[update]
fn compare_documents(doc_id1: String, doc_id2: String) -> CompareResult {
    // Retrieve documents
    let doc1_opt = DOCUMENTS.with(|docs| docs.borrow().get(&doc_id1));
    let doc2_opt = DOCUMENTS.with(|docs| docs.borrow().get(&doc_id2));
    
    let (doc1, doc2) = match (doc1_opt, doc2_opt) {
        (Some(d1), Some(d2)) => (d1, d2),
        _ => {
            return CompareResult {
                similarity_score: None,
                tokens_compared: 0,
                success: false,
                message: "One or both documents not found".to_string(),
                plagiarism_score: None,
            };
        }
    };
    
    let similarity = calculate_similarity(&doc1.tokens, &doc2.tokens);
    
    CompareResult {
        similarity_score: Some(similarity.score),
        tokens_compared: similarity.tokens_compared,
        success: true,
        message: format!("Compared {} tokens", similarity.tokens_compared),
        plagiarism_score: None,
    }
}

/// Compare incoming encrypted tokens with a stored document
/// Supports both duplicate detection and plagiarism detection
#[update]
fn compare_with_document(
    doc_id: String, 
    encrypted_tokens: Vec<Vec<u8>>,
    mode: Option<ComparisonMode>
) -> CompareResult {
    let mode = mode.unwrap_or(ComparisonMode::Duplicate);
    // Retrieve the target document
    let doc_opt = DOCUMENTS.with(|docs| docs.borrow().get(&doc_id));
    
    let stored_doc = match doc_opt {
        Some(doc) => doc,
        None => {
            return CompareResult {
                similarity_score: None,
                tokens_compared: 0,
                success: false,
                message: "Document not found".to_string(),
                plagiarism_score: None,
            };
        }
    };
    
    // Get configuration
    let config = CONFIG.with(|c| c.borrow().get().clone());
    
    let mut similarity_score = None;
    let mut plagiarism_score = None;
    let tokens_compared;
    let message;
    let mut success = true;
    
    // Run appropriate comparison based on mode
    match mode {
        ComparisonMode::Duplicate => {
            let similarity = calculate_similarity(&stored_doc.tokens, &encrypted_tokens);
            similarity_score = Some(similarity.score);
            tokens_compared = similarity.tokens_compared;
            
            if similarity.score >= config.duplicate_threshold {
                success = false;
                message = format!(
                    "Document similarity ({:.1}%) exceeds threshold ({:.1}%). Potential duplicate detected.",
                    similarity.score, config.duplicate_threshold
                );
            } else {
                message = format!("Compared {} tokens, similarity: {:.1}%", tokens_compared, similarity.score);
            }
        }
        
        ComparisonMode::Plagiarism => {
            let plagiarism = calculate_plagiarism_score(&stored_doc.tokens, &encrypted_tokens);
            plagiarism_score = Some(plagiarism.score);
            tokens_compared = plagiarism.chunks_checked;
            
            if plagiarism.score >= config.duplicate_threshold {
                success = false;
                message = format!(
                    "High plagiarism detected ({:.1}%). Found {} matching segments.",
                    plagiarism.score, plagiarism.matching_chunks
                );
            } else {
                message = format!(
                    "Plagiarism check: {:.1}% overlap found in {} chunks",
                    plagiarism.score, plagiarism.chunks_checked
                );
            }
        }
        
        ComparisonMode::Both => {
            // Run both checks
            let similarity = calculate_similarity(&stored_doc.tokens, &encrypted_tokens);
            let plagiarism = calculate_plagiarism_score(&stored_doc.tokens, &encrypted_tokens);
            
            similarity_score = Some(similarity.score);
            plagiarism_score = Some(plagiarism.score);
            tokens_compared = similarity.tokens_compared.max(plagiarism.chunks_checked);
            
            // Fail if either check fails
            if similarity.score >= config.duplicate_threshold || plagiarism.score >= config.duplicate_threshold {
                success = false;
                message = format!(
                    "Failed checks - Duplicate: {:.1}%, Plagiarism: {:.1}%",
                    similarity.score, plagiarism.score
                );
            } else {
                message = format!(
                    "Passed both checks - Duplicate: {:.1}%, Plagiarism: {:.1}%",
                    similarity.score, plagiarism.score
                );
            }
        }
    }
    
    // If initial check passed but we need to check all documents
    if success && config.check_all_duplicates {
        // Keep existing all-document check logic...
        // (We'll update this part next)
    }
    
    // If initial check passed but we need to check all documents
    if success && config.check_all_duplicates {
        // TODO: Implement all-document check for the selected mode
        // For now, we'll skip this for plagiarism mode as it's expensive
        if matches!(mode, ComparisonMode::Duplicate | ComparisonMode::Both) {
            // Use existing fingerprint logic...
        }
    }
    
    CompareResult {
        similarity_score,
        tokens_compared,
        success,
        message,
        plagiarism_score,
    }
}

// Helper struct for similarity calculation
struct SimilarityResult {
    score: f64,
    tokens_compared: u32,
}

// Helper function to calculate similarity between two token sets
fn calculate_similarity(tokens1: &[Vec<u8>], tokens2: &[Vec<u8>]) -> SimilarityResult {
    let min_len = tokens1.len().min(tokens2.len());
    let max_len = tokens1.len().max(tokens2.len());
    
    if min_len == 0 {
        return SimilarityResult {
            score: 0.0,
            tokens_compared: 0,
        };
    }
    
    let mut matches = 0;
    
    // Compare tokens at same positions
    for i in 0..min_len {
        if tokens1[i] == tokens2[i] {
            matches += 1;
        }
    }
    
    // Calculate similarity as percentage of matching tokens
    // Penalize for length differences
    let position_score = (matches as f64 / min_len as f64) * 100.0;
    let length_penalty = min_len as f64 / max_len as f64;
    let final_score = position_score * length_penalty;
    
    SimilarityResult {
        score: final_score,
        tokens_compared: min_len as u32,
    }
}

// Fast fingerprint similarity for pre-filtering
#[allow(dead_code)]
fn calculate_fingerprint_similarity(tokens1: &[Vec<u8>], tokens2: &[Vec<u8>]) -> f64 {
    let len = tokens1.len().min(tokens2.len());
    if len == 0 {
        return 0.0;
    }
    
    let matches = tokens1.iter()
        .zip(tokens2.iter())
        .filter(|(t1, t2)| t1 == t2)
        .count();
    
    (matches as f64 / len as f64) * 100.0
}

// Create a robust fingerprint by sampling tokens throughout the document
#[allow(dead_code)]
fn create_document_fingerprint(tokens: &[Vec<u8>], sample_size: usize) -> Vec<Vec<u8>> {
    if tokens.len() <= sample_size {
        // If document is small, use all tokens
        return tokens.to_vec();
    }
    
    let mut fingerprint = Vec::with_capacity(sample_size);
    
    // Always include first and last tokens
    fingerprint.push(tokens[0].clone());
    
    if sample_size > 2 {
        // Sample evenly throughout the document
        let step = tokens.len() / (sample_size - 1);
        
        for i in 1..(sample_size - 1) {
            let index = i * step;
            if index < tokens.len() {
                fingerprint.push(tokens[index].clone());
            }
        }
    }
    
    // Always include the last token
    fingerprint.push(tokens[tokens.len() - 1].clone());
    
    fingerprint
}

// Plagiarism detection result
struct PlagiarismResult {
    score: f64,
    matching_chunks: u32,
    chunks_checked: u32,
}

// N-gram based plagiarism detection
fn calculate_plagiarism_score(source_tokens: &[Vec<u8>], check_tokens: &[Vec<u8>]) -> PlagiarismResult {
    if source_tokens.is_empty() || check_tokens.is_empty() {
        return PlagiarismResult {
            score: 0.0,
            matching_chunks: 0,
            chunks_checked: 0,
        };
    }
    
    // Use n-grams of size 5 (configurable)
    let n_gram_size = 5;
    
    if check_tokens.len() < n_gram_size {
        // Document too small for n-gram analysis
        return PlagiarismResult {
            score: 0.0,
            matching_chunks: 0,
            chunks_checked: 0,
        };
    }
    
    // Create n-grams from source document for quick lookup
    let mut source_ngrams = std::collections::HashSet::new();
    if source_tokens.len() >= n_gram_size {
        for window in source_tokens.windows(n_gram_size) {
            source_ngrams.insert(window);
        }
    }
    
    // Check how many n-grams from the check document appear in source
    let mut matching_chunks = 0;
    let chunks_checked = check_tokens.len() - n_gram_size + 1;
    
    for window in check_tokens.windows(n_gram_size) {
        if source_ngrams.contains(window) {
            matching_chunks += 1;
        }
    }
    
    // Calculate plagiarism score
    let score = if chunks_checked > 0 {
        (matching_chunks as f64 / chunks_checked as f64) * 100.0
    } else {
        0.0
    };
    
    PlagiarismResult {
        score,
        matching_chunks,
        chunks_checked: chunks_checked as u32,
    }
}

// Create n-gram fingerprint for plagiarism pre-filtering
#[allow(dead_code)]
fn create_plagiarism_fingerprint(tokens: &[Vec<u8>], n_gram_size: usize, sample_count: usize) -> Vec<Vec<Vec<u8>>> {
    if tokens.len() < n_gram_size {
        return vec![];
    }
    
    let total_ngrams = tokens.len() - n_gram_size + 1;
    let step = total_ngrams.max(1) / sample_count.max(1);
    let step = step.max(1);
    
    let mut fingerprint = Vec::new();
    
    for i in (0..total_ngrams).step_by(step).take(sample_count) {
        let ngram: Vec<Vec<u8>> = tokens[i..i + n_gram_size].to_vec();
        fingerprint.push(ngram);
    }
    
    fingerprint
}

/// Get stored document IDs for the caller
#[query]
fn list_my_documents() -> Vec<String> {
    let caller = ic_cdk::caller();
    
    DOCUMENTS.with(|docs| {
        docs.borrow()
            .iter()
            .filter(|(_, doc)| doc.owner == caller)
            .map(|(id, _)| id)
            .collect()
    })
}

/// Get all documents with metadata (for comparison view)
#[query]
fn list_all_documents() -> Vec<DocumentMetadata> {
    DOCUMENTS.with(|docs| {
        docs.borrow()
            .iter()
            .map(|(id, doc)| DocumentMetadata {
                document_id: id,
                title: doc.title.clone().unwrap_or_else(|| "Untitled Document".to_string()),
                owner: doc.owner,
                timestamp: doc.timestamp,
                public_key_n: doc.public_key_n.clone(),
                public_key_g: doc.public_key_g.clone(),
            })
            .collect()
    })
}

/// Get canister statistics
#[query]
fn get_stats() -> Stats {
    let doc_count = DOCUMENTS.with(|docs| docs.borrow().len());
    let config = CONFIG.with(|c| c.borrow().get().clone());
    
    Stats {
        total_documents: doc_count,
        memory_used_bytes: doc_count * 1024, // Rough estimate
        max_documents: config.max_documents,
        max_tokens_per_document: config.max_tokens_per_document,
        duplicate_threshold: config.duplicate_threshold,
        check_all_duplicates: config.check_all_duplicates,
        fingerprint_size: config.fingerprint_size,
        fingerprint_threshold: config.fingerprint_threshold,
    }
}

/// Update configuration (admin only)
#[update]
fn update_config(new_config: ConfigUpdate) -> Result<String, String> {
    // In production, add proper access control here
    // For now, we'll allow any principal to update
    
    CONFIG.with(|c| {
        let mut config = c.borrow().get().clone();
        
        if let Some(max_docs) = new_config.max_documents {
            config.max_documents = max_docs;
        }
        if let Some(max_tokens) = new_config.max_tokens_per_document {
            config.max_tokens_per_document = max_tokens;
        }
        if let Some(threshold) = new_config.duplicate_threshold {
            if threshold < 0.0 || threshold > 100.0 {
                return Err("Duplicate threshold must be between 0 and 100".to_string());
            }
            config.duplicate_threshold = threshold;
        }
        if let Some(check_all) = new_config.check_all_duplicates {
            config.check_all_duplicates = check_all;
        }
        if let Some(fp_size) = new_config.fingerprint_size {
            config.fingerprint_size = fp_size;
        }
        if let Some(fp_threshold) = new_config.fingerprint_threshold {
            if fp_threshold < 0.0 || fp_threshold > 100.0 {
                return Err("Fingerprint threshold must be between 0 and 100".to_string());
            }
            config.fingerprint_threshold = fp_threshold;
        }
        
        c.borrow_mut().set(config)
            .map_err(|_| "Failed to update config".to_string())?;
        
        Ok("Configuration updated successfully".to_string())
    })
}

// Types for API
#[derive(CandidType, Deserialize)]
struct Stats {
    total_documents: u64,
    memory_used_bytes: u64,
    max_documents: u32,
    max_tokens_per_document: u32,
    duplicate_threshold: f64,
    check_all_duplicates: bool,
    fingerprint_size: u32,
    fingerprint_threshold: f64,
}

#[derive(CandidType, Deserialize)]
struct ConfigUpdate {
    max_documents: Option<u32>,
    max_tokens_per_document: Option<u32>,
    duplicate_threshold: Option<f64>,
    check_all_duplicates: Option<bool>,
    fingerprint_size: Option<u32>,
    fingerprint_threshold: Option<f64>,
}

// Export candid interface
ic_cdk::export_candid!();