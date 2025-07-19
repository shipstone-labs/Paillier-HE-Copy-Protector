#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Paillier POC Canister Deployment ===${NC}"
echo "Deploying to local Internet Computer replica..."

# Check if dfx is installed
if ! command -v dfx &> /dev/null; then
    echo -e "${RED}Error: dfx is not installed${NC}"
    echo "Please install dfx from: https://internetcomputer.org/docs/current/developer-docs/setup/install/"
    exit 1
fi

# Check if local replica is running
if ! dfx ping &> /dev/null; then
    echo -e "${YELLOW}Starting local replica...${NC}"
    dfx start --clean --background
    sleep 5
fi

# Build the canister
echo -e "\n${YELLOW}1. Building canister...${NC}"
cargo build --target wasm32-unknown-unknown --release

# Get WASM size with cross-platform support
WASM_PATH="target/wasm32-unknown-unknown/release/paillier_poc_backend.wasm"
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    WASM_SIZE=$(stat -f%z "$WASM_PATH" 2>/dev/null || echo "0")
else
    # Linux and others
    WASM_SIZE=$(stat -c%s "$WASM_PATH" 2>/dev/null || echo "0")
fi

echo "WASM size: $(($WASM_SIZE / 1024)) KB"

# Deploy the canister
echo -e "\n${YELLOW}2. Deploying canister...${NC}"
dfx deploy paillier_poc_backend --argument '()'

# Get canister ID
CANISTER_ID=$(dfx canister id paillier_poc_backend)
echo -e "${GREEN}✓ Canister deployed successfully${NC}"
echo "Canister ID: $CANISTER_ID"

# Show canister status
echo -e "\n${YELLOW}3. Canister status:${NC}"
dfx canister status paillier_poc_backend

# Health check
echo -e "\n${YELLOW}4. Health check:${NC}"
HEALTH=$(dfx canister call paillier_poc_backend health_check)
echo "Health: $HEALTH"

# Show available endpoints
echo -e "\n${BLUE}=== Available Endpoints ===${NC}"
echo "• initialize_paillier() - Initialize the Paillier system"
echo "• encrypt_document(doc_id: text, tokens: vec blob) - Encrypt a document"
echo "• compare_documents(doc_id1: text, doc_id2: text) - Compare encrypted documents"
echo "• get_stats() - Get canister statistics (query)"
echo "• list_documents() - List all documents (query)"
echo "• health_check() - Check canister health (query)"
echo "• clear_all_documents() - Clear all documents (owner only)"

echo -e "\n${GREEN}Deployment complete!${NC}"
echo "Run ./test_canister.sh to test the functionality"
echo "Run node monitor_performance.js to monitor real-time performance"

# Show example commands
echo -e "\n${BLUE}Example commands:${NC}"
echo "dfx canister call paillier_poc_backend initialize_paillier"
echo "dfx canister call paillier_poc_backend encrypt_document '(\"test_doc\", vec { blob \"\\x00\\x01\\x02...\" })'"
echo "dfx canister call paillier_poc_backend get_stats"