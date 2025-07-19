#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Paillier POC Canister Test Suite ===${NC}"
echo "Testing all canister functionality..."

# Function to check result
check_result() {
    if [[ $1 == *"success = true"* ]] || [[ $1 == *"success = variant { Ok }"* ]]; then
        echo -e "${GREEN}✓ Success${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed${NC}"
        echo "Response: $1"
        return 1
    fi
}

# Function to extract instructions from result
extract_instructions() {
    echo "$1" | grep -o 'instructions_used = [0-9]*' | grep -o '[0-9]*' || echo "0"
}

# Deploy canister
echo -e "\n${YELLOW}1. Deploying canister...${NC}"
dfx deploy paillier_poc_backend --argument '()'

# Get canister ID
CANISTER_ID=$(dfx canister id paillier_poc_backend)
echo "Canister ID: $CANISTER_ID"

# Health check
echo -e "\n${YELLOW}2. Health check...${NC}"
HEALTH=$(dfx canister call paillier_poc_backend health_check)
echo "Health: $HEALTH"

# Initialize Paillier
echo -e "\n${YELLOW}3. Initializing Paillier...${NC}"
INIT_RESULT=$(dfx canister call paillier_poc_backend initialize_paillier)
echo "$INIT_RESULT"
check_result "$INIT_RESULT"
INIT_INSTRUCTIONS=$(extract_instructions "$INIT_RESULT")
echo "Instructions used: $INIT_INSTRUCTIONS"

# Create test tokens (helper function)
create_tokens() {
    local count=$1
    local tokens='vec {'
    for ((i=0; i<$count; i++)); do
        # Create 32-byte token
        tokens+=' blob "'
        for ((j=0; j<32; j++)); do
            tokens+='\x'$(printf '%02x' $((i+j)))
        done
        tokens+='";'
    done
    tokens="${tokens%;}}"
    echo "$tokens"
}

# Test 1: Small document (10 tokens)
echo -e "\n${YELLOW}4. Encrypting 10-token document...${NC}"
TOKENS_10=$(create_tokens 10)
ENCRYPT_10=$(dfx canister call paillier_poc_backend encrypt_document "(\"small_doc\", $TOKENS_10)")
echo "$ENCRYPT_10"
check_result "$ENCRYPT_10"
ENCRYPT_10_INST=$(extract_instructions "$ENCRYPT_10")

# Test 2: Medium document (30 tokens)
echo -e "\n${YELLOW}5. Encrypting 30-token document...${NC}"
TOKENS_30=$(create_tokens 30)
ENCRYPT_30=$(dfx canister call paillier_poc_backend encrypt_document "(\"medium_doc\", $TOKENS_30)")
check_result "$ENCRYPT_30"
ENCRYPT_30_INST=$(extract_instructions "$ENCRYPT_30")

# Test 3: Maximum document (50 tokens)
echo -e "\n${YELLOW}6. Encrypting 50-token document (maximum)...${NC}"
TOKENS_50=$(create_tokens 50)
ENCRYPT_50=$(dfx canister call paillier_poc_backend encrypt_document "(\"large_doc\", $TOKENS_50)")
check_result "$ENCRYPT_50"
ENCRYPT_50_INST=$(extract_instructions "$ENCRYPT_50")

# Test 4: Compare small documents
echo -e "\n${YELLOW}7. Comparing 10-token documents...${NC}"
# Create another small doc for comparison
ENCRYPT_SMALL2=$(dfx canister call paillier_poc_backend encrypt_document "(\"small_doc2\", $TOKENS_10)")
COMPARE_10=$(dfx canister call paillier_poc_backend compare_documents '("small_doc", "small_doc2")')
echo "$COMPARE_10"
check_result "$COMPARE_10"
COMPARE_10_INST=$(extract_instructions "$COMPARE_10")

# Test 5: Compare large documents
echo -e "\n${YELLOW}8. Comparing 50-token documents...${NC}"
ENCRYPT_LARGE2=$(dfx canister call paillier_poc_backend encrypt_document "(\"large_doc2\", $TOKENS_50)")
COMPARE_50=$(dfx canister call paillier_poc_backend compare_documents '("large_doc", "large_doc2")')
echo "$COMPARE_50"
check_result "$COMPARE_50"
COMPARE_50_INST=$(extract_instructions "$COMPARE_50")

# Test 6: Error cases
echo -e "\n${YELLOW}9. Testing error cases...${NC}"

# Too many tokens
echo -e "  ${BLUE}a. Testing with 51 tokens (should fail)...${NC}"
TOKENS_51=$(create_tokens 51)
ENCRYPT_FAIL=$(dfx canister call paillier_poc_backend encrypt_document "(\"fail_doc\", $TOKENS_51)" 2>&1 || true)
if [[ $ENCRYPT_FAIL == *"Too many tokens"* ]]; then
    echo -e "  ${GREEN}✓ Correctly rejected${NC}"
else
    echo -e "  ${RED}✗ Should have failed${NC}"
fi

# Wrong token size
echo -e "  ${BLUE}b. Testing with wrong token size...${NC}"
BAD_TOKEN='vec { blob "\x00\x01\x02" }'  # Only 3 bytes
BAD_ENCRYPT=$(dfx canister call paillier_poc_backend encrypt_document "(\"bad_doc\", $BAD_TOKEN)" 2>&1 || true)
if [[ $BAD_ENCRYPT == *"wrong size"* ]]; then
    echo -e "  ${GREEN}✓ Correctly rejected${NC}"
else
    echo -e "  ${RED}✗ Should have failed${NC}"
fi

# Invalid doc ID
echo -e "  ${BLUE}c. Testing with invalid doc ID...${NC}"
INVALID_ID_ENCRYPT=$(dfx canister call paillier_poc_backend encrypt_document "(\"doc with spaces!\", $TOKENS_10)" 2>&1 || true)
if [[ $INVALID_ID_ENCRYPT == *"Invalid"* ]] || [[ $INVALID_ID_ENCRYPT == *"invalid"* ]]; then
    echo -e "  ${GREEN}✓ Correctly rejected${NC}"
else
    echo -e "  ${RED}✗ Should have failed${NC}"
fi

# Get final stats
echo -e "\n${YELLOW}10. Final statistics...${NC}"
STATS=$(dfx canister call paillier_poc_backend get_stats)
echo "$STATS"

# List documents
echo -e "\n${YELLOW}11. Document list...${NC}"
DOCS=$(dfx canister call paillier_poc_backend list_documents)
echo "$DOCS"

# Performance summary
echo -e "\n${BLUE}=== Performance Summary ===${NC}"
echo "Operation               | Instructions Used | % of Query Limit (5B)"
echo "------------------------|-------------------|--------------------"
printf "Initialize Paillier     | %'15d | %.2f%%\n" $INIT_INSTRUCTIONS $(echo "scale=2; $INIT_INSTRUCTIONS * 100 / 5000000000" | bc)
printf "Encrypt 10 tokens       | %'15d | %.2f%%\n" $ENCRYPT_10_INST $(echo "scale=2; $ENCRYPT_10_INST * 100 / 5000000000" | bc)
printf "Encrypt 30 tokens       | %'15d | %.2f%%\n" $ENCRYPT_30_INST $(echo "scale=2; $ENCRYPT_30_INST * 100 / 5000000000" | bc)
printf "Encrypt 50 tokens       | %'15d | %.2f%%\n" $ENCRYPT_50_INST $(echo "scale=2; $ENCRYPT_50_INST * 100 / 5000000000" | bc)
printf "Compare 10 tokens       | %'15d | %.2f%%\n" $COMPARE_10_INST $(echo "scale=2; $COMPARE_10_INST * 100 / 5000000000" | bc)
printf "Compare 50 tokens       | %'15d | %.2f%%\n" $COMPARE_50_INST $(echo "scale=2; $COMPARE_50_INST * 100 / 5000000000" | bc)

# Check if 50-token comparison is within limits
if [ $COMPARE_50_INST -lt 5000000000 ]; then
    echo -e "\n${GREEN}✓ All operations within ICP query limits${NC}"
else
    echo -e "\n${RED}✗ 50-token comparison exceeds query limits${NC}"
fi

# Cycle cost estimation
TOTAL_INSTRUCTIONS=$((INIT_INSTRUCTIONS + ENCRYPT_10_INST + ENCRYPT_30_INST + ENCRYPT_50_INST + COMPARE_10_INST + COMPARE_50_INST))
CYCLE_COST=$(echo "scale=4; $TOTAL_INSTRUCTIONS / 1000000000 * 0.0001" | bc)
echo -e "\n${BLUE}Estimated cycle cost for all operations: ${CYCLE_COST} ICP${NC}"