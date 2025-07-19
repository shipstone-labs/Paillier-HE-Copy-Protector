# Paillier-HE-Copy-Protector

A proof of concept implementation demonstrating Paillier Partially Homomorphic Encryption (PHE) for secure document comparison on the Internet Computer Protocol (ICP) with vetKeys integration.

## 🎯 Overview

This project enables encrypted document comparison without revealing document contents, using Paillier's homomorphic properties to compare documents while they remain encrypted. Perfect for intellectual property protection, patent comparison, and sensitive document analysis.

### Key Features

- 🔐 **Homomorphic Comparison**: Compare documents without decryption
- 🔑 **vetKeys Integration**: No persistent key storage in canister
- ⚡ **Cached Key Derivation**: High-performance with LRU caching
- 📊 **Real-time Monitoring**: Performance metrics and tracking
- 🌐 **Web Interface**: Interactive demo with command builders
- 🚀 **ICP Optimized**: Works within Internet Computer constraints

## ⚠️ Important Notice

**This is a Prototype** using a simplified Paillier implementation that is NOT cryptographically secure. Do not use for production or sensitive data.

## 🚀 Quick Start

### Prerequisites

- [dfx](https://internetcomputer.org/docs/current/developer-docs/setup/install/) (DFINITY SDK) v0.15.0+
- Node.js (optional, for monitoring)
- Python 3 (optional, for web server)

### One-Command Setup

```bash
cd paillier_poc
./setup_demo.sh
```

This will:
1. Check prerequisites
2. Deploy the canister
3. Initialize with vetKeys
4. Create example documents
5. Launch the demo interface

## 📖 How It Works

```
Document A → Encrypt with PHE → Encrypted Doc A ↘
                                                  → Homomorphic Compare → Encrypted Result
Document B → Encrypt with PHE → Encrypted Doc B ↗
```

Using Paillier's additive homomorphic properties, documents are compared by computing encrypted differences between tokens, all without decryption.

## 🧪 Testing

### Web Interface

Open `demo_local.html` after running setup to access:
- Visual workflow explanation
- Interactive command builders
- Copy-paste ready commands
- Performance metrics

### Terminal Testing

```bash
# Check system status
dfx canister call paillier_poc_backend health_check

# Encrypt a document
dfx canister call paillier_poc_backend encrypt_document '("doc_1", vec { blob "\00\01\02..." })'

# Compare documents
dfx canister call paillier_poc_backend compare_documents '("doc_1", "doc_2")'

# View metrics
dfx canister call paillier_poc_backend get_vetkd_metrics
```

### Comprehensive Test Suite

```bash
./test_vetkd_integration.sh
```

## 📊 Performance

| Operation | Instructions | Time | Notes |
|-----------|-------------|------|-------|
| Initialize | ~12M | 100-200ms | One-time setup |
| Encrypt (first) | ~500-700M | 200-300ms | Derives key |
| Encrypt (cached) | ~500M | 50-100ms | Uses cached key |
| Compare (40 tokens) | ~1.2-1.5B | 400-600ms | Within ICP limits |

### Limits
- **Max tokens per document**: 40 (reduced from 50 for vetKeys overhead)
- **Max documents**: 100 (memory constraint)
- **Key cache**: 100 keys with 5-minute TTL

## 🏗️ Architecture

### vetKeys Integration
- No persistent key storage
- Keys derived on-demand per document
- LRU cache for performance
- Automatic fallback for testing

### Core Components
```
src/paillier_poc_backend/
├── src/
│   ├── lib.rs              # Main canister logic
│   ├── simple_paillier.rs  # PHE implementation (POC)
│   ├── vetkd_check.rs      # vetKeys availability
│   └── vetkd_utils.rs      # Key management & caching
└── paillier_poc_backend.did # Candid interface
```

## 🔍 Monitoring

Real-time performance monitoring:

```bash
node monitor_performance_vetkd.js
```

Shows:
- Operation tracking
- Cache hit rates
- Instruction usage
- Memory consumption
- vetKeys metrics

## 🛡️ Security Considerations

### Current Limitations (POC)
- SimplePaillier is NOT cryptographically secure
- Deterministic randomness (ICP constraint)
- No true random number generation
- Simplified key generation

### Production Requirements
- Replace SimplePaillier with audited implementation
- Implement proper prime generation
- Add external randomness beacon
- Complete security audit
- Implement key rotation

## 📚 Documentation

- [Demo Guide](README_DEMO.md) - Complete testing instructions
- [vetKeys Integration](VETKD_INTEGRATION_GUIDE.md) - Technical integration details
- [Security Checklist](SECURITY_AUDIT_CHECKLIST.md) - Security audit requirements
- [Implementation Summary](VETKD_IMPLEMENTATION_SUMMARY.md) - Development overview

## 🔧 Development

### Building from Source

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Build
cargo build --target wasm32-unknown-unknown --release
```

### Running Tests

```bash
# Integration tests
./test_vetkd_integration.sh

# Canister logs
dfx canister logs paillier_poc_backend
```

## 🤝 Contributing

This is a proof of concept for demonstration purposes. For production use:

1. Implement secure Paillier encryption
2. Add proper randomness generation
3. Complete security audit
4. Implement stable memory persistence
5. Add threshold encryption support

## 📝 License

This POC is for educational and demonstration purposes only.

## 🙏 Acknowledgments

- DFINITY Foundation for the Internet Computer Protocol
- The ICP community for vetKeys development
- Cryptography researchers for Paillier encryption scheme

---

**Remember**: This is a proof of concept demonstrating the feasibility of homomorphic encryption on ICP. Do not use for production without proper security implementation.
