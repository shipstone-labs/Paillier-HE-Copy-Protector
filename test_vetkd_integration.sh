#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

echo -e "${MAGENTA}=== vetKeys Integration Test Suite ===${NC}"
echo "Testing Paillier POC with vetKeys support..."

# Helper functions
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

extract_value() {
    echo "$1" | grep -o "$2 = [0-9]*" | grep -o '[0-9]*' || echo "0"
}

# Test 1: Check vetKeys availability
echo -e "\n${YELLOW}1. Checking vetKeys support...${NC}"
VETKD_CHECK=$(dfx canister call paillier_poc_backend check_vetkd_support 2>&1 || true)
FALLBACK_MODE=false

if [[ $VETKD_CHECK == *"true"* ]]; then
    echo -e "${GREEN}✓ vetKeys is available on this subnet${NC}"
else
    echo -e "${YELLOW}⚠ vetKeys not available, will use fallback mode${NC}"
    FALLBACK_MODE=true
fi

# Test 2: Get vetKeys info
echo -e "\n${YELLOW}2. Getting vetKeys configuration info...${NC}"
VETKD_INFO=$(dfx canister call paillier_poc_backend get_vetkd_info 2>&1 || true)
echo "$VETKD_INFO"

# Test 3: Initialize with vetKeys
echo -e "\n${YELLOW}3. Initializing Paillier with vetKeys...${NC}"
INIT_RESULT=$(dfx canister call paillier_poc_backend initialize_paillier)
echo "$INIT_RESULT"
check_result "$INIT_RESULT"

# Test 4: Test key derivation consistency
echo -e "\n${YELLOW}4. Testing key derivation consistency...${NC}"
DOC_ID="consistency_test_$(date +%s)"

# Create test token (32 bytes)
TOKEN='blob "'
for ((i=0; i<32; i++)); do
    TOKEN+=$(printf '\\x%02x' $i)
done
TOKEN+='"'

# First encryption
echo "  Encrypting document first time..."
RESULT1=$(dfx canister call paillier_poc_backend encrypt_document "(\"$DOC_ID\", vec { $TOKEN })")
check_result "$RESULT1"
INST1=$(extract_value "$RESULT1" "instructions_used")
echo "  Instructions used: $INST1"

# Second encryption (should use cached key)
echo "  Re-encrypting same document (should use cache)..."
RESULT2=$(dfx canister call paillier_poc_backend encrypt_document "(\"$DOC_ID\", vec { $TOKEN })")
check_result "$RESULT2"
INST2=$(extract_value "$RESULT2" "instructions_used")
echo "  Instructions used: $INST2"

# Compare instruction usage
if [ $INST2 -lt $INST1 ]; then
    echo -e "  ${GREEN}✓ Cache working: Second encryption used fewer instructions${NC}"
else
    echo -e "  ${YELLOW}⚠ Cache may not be working as expected${NC}"
fi

# Test 5: Batch operations
echo -e "\n${YELLOW}5. Testing batch encryption...${NC}"

# Create batch operations
BATCH_OPS='vec { '
for i in {1..3}; do
    DOC="batch_doc_$i"
    TOKEN='blob "'
    for ((j=0; j<32; j++)); do
        TOKEN+=$(printf '\\x%02x' $((i+j)))
    done
    TOKEN+='"'
    BATCH_OPS+="record { \"$DOC\"; vec { $TOKEN } }; "
done
BATCH_OPS="${BATCH_OPS%; }}"

echo "  Encrypting 3 documents in batch..."
BATCH_RESULT=$(dfx canister call paillier_poc_backend batch_encrypt_documents "($BATCH_OPS)")
echo "$BATCH_RESULT"

# Count successes
SUCCESS_COUNT=$(echo "$BATCH_RESULT" | grep -o "success = true" | wc -l)
echo -e "  ${GREEN}✓ Successfully encrypted $SUCCESS_COUNT/3 documents${NC}"

# Test 6: Get vetKeys metrics
echo -e "\n${YELLOW}6. Checking vetKeys metrics...${NC}"
METRICS=$(dfx canister call paillier_poc_backend get_vetkd_metrics)
echo "$METRICS"

# Extract and display key metrics
KEY_DERIVATIONS=$(extract_value "$METRICS" "key_derivations")
CACHE_HITS=$(extract_value "$METRICS" "cache_hits")
CACHE_MISSES=$(extract_value "$METRICS" "cache_misses")
FALLBACK_USES=$(extract_value "$METRICS" "fallback_uses")

echo -e "\n${BLUE}=== vetKeys Performance Summary ===${NC}"
echo "Key Derivations:    $KEY_DERIVATIONS"
echo "Cache Hits:         $CACHE_HITS"
echo "Cache Misses:       $CACHE_MISSES"
echo "Fallback Uses:      $FALLBACK_USES"

if [ $CACHE_HITS -gt 0 ] && [ $CACHE_MISSES -gt 0 ]; then
    CACHE_HIT_RATE=$(echo "scale=2; $CACHE_HITS * 100 / ($CACHE_HITS + $CACHE_MISSES)" | bc)
    echo "Cache Hit Rate:     ${CACHE_HIT_RATE}%"
fi

# Test 7: Migration support
echo -e "\n${YELLOW}7. Testing document migration...${NC}"
MIGRATE_RESULT=$(dfx canister call paillier_poc_backend migrate_document "(\"batch_doc_1\")")
echo "$MIGRATE_RESULT"

# Test 8: Cache clearing (owner only)
echo -e "\n${YELLOW}8. Testing cache clearing...${NC}"
CLEAR_RESULT=$(dfx canister call paillier_poc_backend clear_vetkd_cache 2>&1 || true)
echo "$CLEAR_RESULT"

# Test 9: Performance comparison
echo -e "\n${YELLOW}9. Performance comparison (with/without cache)...${NC}"

# Clear cache first
dfx canister call paillier_poc_backend clear_vetkd_cache 2>&1 >/dev/null || true

# Encrypt without cache
DOC_PERF="perf_test_$(date +%s)"
START_TIME=$(date +%s%N)
RESULT_NO_CACHE=$(dfx canister call paillier_poc_backend encrypt_document "(\"$DOC_PERF\", vec { $TOKEN })")
END_TIME=$(date +%s%N)
TIME_NO_CACHE=$(( ($END_TIME - $START_TIME) / 1000000 )) # Convert to ms
echo "  Time without cache: ${TIME_NO_CACHE}ms"

# Encrypt with cache
START_TIME=$(date +%s%N)
RESULT_WITH_CACHE=$(dfx canister call paillier_poc_backend encrypt_document "(\"$DOC_PERF\", vec { $TOKEN })")
END_TIME=$(date +%s%N)
TIME_WITH_CACHE=$(( ($END_TIME - $START_TIME) / 1000000 ))
echo "  Time with cache: ${TIME_WITH_CACHE}ms"

if [ $TIME_WITH_CACHE -lt $TIME_NO_CACHE ]; then
    SPEEDUP=$(echo "scale=2; $TIME_NO_CACHE / $TIME_WITH_CACHE" | bc)
    echo -e "  ${GREEN}✓ Cache provides ${SPEEDUP}x speedup${NC}"
fi

# Test 10: Error handling
echo -e "\n${YELLOW}10. Testing error handling...${NC}"

# Test with too many tokens (should fail)
echo "  Testing with 41 tokens (exceeds limit)..."
LARGE_TOKENS='vec { '
for ((i=0; i<41; i++)); do
    LARGE_TOKENS+="$TOKEN; "
done
LARGE_TOKENS="${LARGE_TOKENS%; }}"

ERROR_RESULT=$(dfx canister call paillier_poc_backend encrypt_document "(\"error_test\", $LARGE_TOKENS)" 2>&1 || true)
if [[ $ERROR_RESULT == *"Too many tokens"* ]]; then
    echo -e "  ${GREEN}✓ Correctly rejected too many tokens${NC}"
else
    echo -e "  ${RED}✗ Failed to reject invalid input${NC}"
fi

# Final summary
echo -e "\n${MAGENTA}=== Test Summary ===${NC}"
echo "vetKeys Available: $([ "$FALLBACK_MODE" = true ] && echo "No (using fallback)" || echo "Yes")"
echo "All tests completed!"

# Show final stats
echo -e "\n${BLUE}Final canister stats:${NC}"
dfx canister call paillier_poc_backend get_stats