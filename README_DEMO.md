# Paillier FHE Document Comparison - Demo & Testing Guide

## 🚀 Quick Start

### Prerequisites
- **dfx** (DFINITY SDK) version 0.15.0 or higher
- **Node.js** (optional, for monitoring)
- **Python 3** (optional, for serving demo page)

### One-Command Setup
```bash
cd /Users/creed/projects/rust-wasm/paillier-icp-canister/paillier_poc
./setup_demo.sh
```

This will:
1. Check prerequisites
2. Deploy the canister (if needed)
3. Initialize with vetKeys
4. Create example documents
5. Generate a demo page with your canister ID

---

## 🖥️ Testing via Web Interface

### Opening the Demo Page

**Option 1: Direct File Access**
```bash
open demo_local.html
```

**Option 2: Local Web Server**
```bash
./serve_demo.sh
# Then visit: http://localhost:8080/demo_local.html
```

### Using the Demo Interface

The demo page has 5 tabs:

1. **Overview** - Understand how the system works
2. **Quick Start** - Step-by-step setup guide
3. **Commands** - Interactive command builder
4. **Testing** - Complete test workflows
5. **Monitoring** - Performance tracking guides

### Key Features of the Web Interface

#### Command Builder (Commands Tab)
1. **Encrypt Document**:
   - Enter a document ID (alphanumeric, _, - only)
   - Select number of tokens (5-40)
   - Click "Generate Encrypt Command"
   - Copy the generated command
   - Run it in your terminal

2. **Compare Documents**:
   - Enter two document IDs
   - Click "Generate Compare Command"
   - Copy and run in terminal

#### Visual Workflow (Overview Tab)
- Shows the FHE process visually
- Lists key features and limitations
- Checks system requirements

---

## 🖥️ Testing via Terminal

### Basic Commands

#### 1. Check System Status
```bash
# Health check
dfx canister call paillier_poc_backend health_check

# Get statistics
dfx canister call paillier_poc_backend get_stats

# Check vetKeys support
dfx canister call paillier_poc_backend check_vetkd_support
```

#### 2. Document Encryption
```bash
# Encrypt a document with 10 tokens
dfx canister call paillier_poc_backend encrypt_document '("my_doc_1", vec { 
  blob "\00\01\02\03\04\05\06\07\08\09\0a\0b\0c\0d\0e\0f\10\11\12\13\14\15\16\17\18\19\1a\1b\1c\1d\1e\1f";
  blob "\20\21\22\23\24\25\26\27\28\29\2a\2b\2c\2d\2e\2f\30\31\32\33\34\35\36\37\38\39\3a\3b\3c\3d\3e\3f";
  # ... add more 32-byte blobs for more tokens
})'

# List all documents
dfx canister call paillier_poc_backend list_documents
```

#### 3. Document Comparison
```bash
# Compare two encrypted documents
dfx canister call paillier_poc_backend compare_documents '("my_doc_1", "my_doc_2")'
```

#### 4. Performance Metrics
```bash
# Get vetKeys metrics
dfx canister call paillier_poc_backend get_vetkd_metrics

# Clear cache (owner only)
dfx canister call paillier_poc_backend clear_vetkd_cache
```

### Complete Test Workflow

#### Test 1: Basic Functionality
```bash
# 1. Encrypt first document
dfx canister call paillier_poc_backend encrypt_document '("test_basic_1", vec { blob "\00\01\02\03\04\05\06\07\08\09\0a\0b\0c\0d\0e\0f\10\11\12\13\14\15\16\17\18\19\1a\1b\1c\1d\1e\1f" })'

# 2. Encrypt second document
dfx canister call paillier_poc_backend encrypt_document '("test_basic_2", vec { blob "\20\21\22\23\24\25\26\27\28\29\2a\2b\2c\2d\2e\2f\30\31\32\33\34\35\36\37\38\39\3a\3b\3c\3d\3e\3f" })'

# 3. Compare documents
dfx canister call paillier_poc_backend compare_documents '("test_basic_1", "test_basic_2")'
```

#### Test 2: Cache Effectiveness
```bash
# 1. Check initial metrics
dfx canister call paillier_poc_backend get_vetkd_metrics

# 2. Encrypt document (triggers key derivation)
dfx canister call paillier_poc_backend encrypt_document '("cache_test", vec { blob "\00\01\02\03\04\05\06\07\08\09\0a\0b\0c\0d\0e\0f\10\11\12\13\14\15\16\17\18\19\1a\1b\1c\1d\1e\1f" })'

# 3. Check metrics (should show 1 derivation)
dfx canister call paillier_poc_backend get_vetkd_metrics

# 4. Re-encrypt same document (should use cache)
dfx canister call paillier_poc_backend encrypt_document '("cache_test", vec { blob "\40\41\42\43\44\45\46\47\48\49\4a\4b\4c\4d\4e\4f\50\51\52\53\54\55\56\57\58\59\5a\5b\5c\5d\5e\5f" })'

# 5. Check metrics again (should show cache hit)
dfx canister call paillier_poc_backend get_vetkd_metrics
```

#### Test 3: Performance Limits
```bash
# Run comprehensive test suite
./test_vetkd_integration.sh
```

### Real-time Monitoring

Start the performance monitor in a separate terminal:
```bash
node monitor_performance_vetkd.js
```

This shows:
- Live operation tracking
- Instruction usage
- Memory consumption
- vetKeys cache performance
- Recent operation history

---

## 📊 Understanding the Output

### Successful Encryption Output
```
(
  record {
    success = true;
    doc_id = "test_doc_1";
    tokens_encrypted = 10;
    time_ms = 234;
    instructions_used = 500_000_000;
    memory_used_kb = 52;
    error = null;
  },
)
```

### Successful Comparison Output
```
(
  record {
    success = true;
    similarity_score = opt blob "\de\ad\be\ef...";  # Encrypted result
    time_ms = 456;
    instructions_used = 1_200_000_000;
    instruction_percentage = 24.0 : float32;
    error = null;
  },
)
```

### vetKeys Metrics Output
```
(
  record {
    key_derivations = 5;
    cache_hits = 12;
    cache_misses = 5;
    total_derivation_time = 750_000_000;  # nanoseconds
    fallback_uses = 0;
    derivation_times = vec { 150_000_000; 145_000_000; ... };
  },
)
```

---

## 🔧 Troubleshooting

### Common Issues

1. **"vetKeys not available"**
   - You're on a subnet without vetKeys support
   - System will use fallback mode automatically
   - Performance will be similar, security is reduced

2. **"Instruction limit exceeded"**
   - Reduce number of tokens per document
   - Current limit: 40 tokens per document
   - Use batch operations for multiple documents

3. **"Invalid document ID"**
   - Use only: letters, numbers, underscore (_), hyphen (-)
   - Maximum 64 characters
   - No spaces or special characters

4. **"Not initialized"**
   - Run: `dfx canister call paillier_poc_backend initialize_paillier`
   - Check health: `dfx canister call paillier_poc_backend health_check`

### Debug Commands

```bash
# Check canister logs
dfx canister logs paillier_poc_backend

# Get canister status
dfx canister status paillier_poc_backend

# Check canister ID
dfx canister id paillier_poc_backend
```

---

## 🎯 Test Scenarios

### Scenario 1: Document Similarity Test
Create documents with varying similarity:
```bash
# Very similar documents (differ by 1 byte)
dfx canister call paillier_poc_backend encrypt_document '("similar_1", vec { blob "\00\01\02\03\04\05\06\07\08\09\0a\0b\0c\0d\0e\0f\10\11\12\13\14\15\16\17\18\19\1a\1b\1c\1d\1e\1f" })'
dfx canister call paillier_poc_backend encrypt_document '("similar_2", vec { blob "\00\01\02\03\04\05\06\07\08\09\0a\0b\0c\0d\0e\0f\10\11\12\13\14\15\16\17\18\19\1a\1b\1c\1d\1e\20" })'

# Compare
dfx canister call paillier_poc_backend compare_documents '("similar_1", "similar_2")'
```

### Scenario 2: Performance Stress Test
Test with maximum tokens:
```bash
# Create script to generate 40 tokens
./test_vetkd_integration.sh
```

### Scenario 3: Cache Performance
Monitor cache effectiveness:
```bash
# In terminal 1: Start monitor
node monitor_performance_vetkd.js

# In terminal 2: Run operations
for i in {1..10}; do
  dfx canister call paillier_poc_backend encrypt_document "(\"cache_doc_$i\", vec { blob \"\00\01\02\03\04\05\06\07\08\09\0a\0b\0c\0d\0e\0f\10\11\12\13\14\15\16\17\18\19\1a\1b\1c\1d\1e\1f\" })"
done
```

---

## 📈 Performance Expectations

| Operation | Expected Time | Instruction Usage |
|-----------|--------------|-------------------|
| Initialize | 100-200ms | ~12M |
| Encrypt (first time) | 200-300ms | ~500M-700M |
| Encrypt (cached) | 50-100ms | ~500M |
| Compare (40 tokens) | 400-600ms | ~1.2B-1.5B |
| Key derivation | 100-200ms | ~1-2M |

### Cache Performance
- Target hit rate: >80% after warmup
- Cache capacity: 100 keys
- TTL: 5 minutes

---

## 🚨 Security Notice

**This is a PROOF OF CONCEPT**
- SimplePaillier is NOT cryptographically secure
- Deterministic randomness is used (ICP limitation)
- Do NOT use for production or sensitive data
- For demonstration and testing only

---

## 📚 Additional Resources

- [Full Implementation Summary](VETKD_IMPLEMENTATION_SUMMARY.md)
- [Integration Guide](VETKD_INTEGRATION_GUIDE.md)
- [Security Checklist](SECURITY_AUDIT_CHECKLIST.md)
- [ICP vetKeys Documentation](https://internetcomputer.org/docs/current/developer-docs/integrations/vetkeys/)

---

## 🎉 Next Steps

1. **Explore**: Use the web interface to understand the system
2. **Test**: Run the provided test scenarios
3. **Monitor**: Watch real-time performance metrics
4. **Experiment**: Create your own documents and comparisons
5. **Learn**: Review the code and documentation

For questions or issues, check the troubleshooting section or review the canister logs.