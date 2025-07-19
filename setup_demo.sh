#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

echo -e "${MAGENTA}=== Paillier FHE POC Demo Setup ===${NC}"
echo ""

# Check if we're in the right directory
if [[ ! -f "dfx.json" ]]; then
    echo -e "${RED}Error: Not in the paillier_poc directory${NC}"
    echo "Please run this script from /Users/creed/projects/rust-wasm/paillier-icp-canister/paillier_poc"
    exit 1
fi

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check dfx
if command -v dfx &> /dev/null; then
    DFX_VERSION=$(dfx --version | cut -d' ' -f2)
    echo -e "${GREEN}✓ dfx installed (version $DFX_VERSION)${NC}"
else
    echo -e "${RED}✗ dfx not found${NC}"
    echo "Please install dfx from: https://internetcomputer.org/docs/current/developer-docs/setup/install/"
    exit 1
fi

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓ Node.js installed ($NODE_VERSION)${NC}"
else
    echo -e "${YELLOW}⚠ Node.js not found (optional, needed for monitoring)${NC}"
fi

# Check if canister is already deployed
echo -e "\n${YELLOW}Checking canister status...${NC}"
if dfx canister id paillier_poc_backend &> /dev/null; then
    CANISTER_ID=$(dfx canister id paillier_poc_backend)
    echo -e "${GREEN}✓ Canister already deployed: $CANISTER_ID${NC}"
    
    # Check if initialized
    HEALTH=$(dfx canister call paillier_poc_backend health_check 2>&1 || true)
    if [[ $HEALTH == *"Ready"* ]]; then
        echo -e "${GREEN}✓ Canister already initialized${NC}"
        INITIALIZED=true
    else
        echo -e "${YELLOW}⚠ Canister not initialized${NC}"
        INITIALIZED=false
    fi
else
    echo -e "${YELLOW}Canister not deployed yet${NC}"
    INITIALIZED=false
    
    # Deploy canister
    echo -e "\n${YELLOW}Deploying canister...${NC}"
    ./deploy.sh
    
    CANISTER_ID=$(dfx canister id paillier_poc_backend)
    echo -e "${GREEN}✓ Canister deployed: $CANISTER_ID${NC}"
fi

# Initialize if needed
if [[ $INITIALIZED == false ]]; then
    echo -e "\n${YELLOW}Initializing Paillier with vetKeys...${NC}"
    INIT_RESULT=$(dfx canister call paillier_poc_backend initialize_paillier)
    if [[ $INIT_RESULT == *"success = true"* ]]; then
        echo -e "${GREEN}✓ Successfully initialized${NC}"
    else
        echo -e "${RED}✗ Initialization failed${NC}"
        echo "$INIT_RESULT"
        exit 1
    fi
fi

# Check vetKeys support
echo -e "\n${YELLOW}Checking vetKeys support...${NC}"
VETKD_CHECK=$(dfx canister call paillier_poc_backend check_vetkd_support 2>&1 || true)
if [[ $VETKD_CHECK == *"true"* ]]; then
    echo -e "${GREEN}✓ vetKeys is supported on this subnet${NC}"
    VETKD_MODE="vetKeys"
else
    echo -e "${YELLOW}⚠ vetKeys not available - using fallback mode${NC}"
    VETKD_MODE="fallback"
fi

# Create demo page with actual canister ID
echo -e "\n${YELLOW}Creating demo page...${NC}"
if [[ -f "standalone_demo.html" ]]; then
    echo -e "${GREEN}✓ Demo page already exists${NC}"
else
    echo -e "${RED}✗ standalone_demo.html not found${NC}"
    echo "Please ensure standalone_demo.html is in the current directory"
    exit 1
fi

# Create a local version with the canister ID embedded
sed "s/be2us-64aaa-aaaaa-qaabq-cai/$CANISTER_ID/g" standalone_demo.html > demo_local.html
echo -e "${GREEN}✓ Created demo_local.html with your canister ID${NC}"

# Create example test data
echo -e "\n${YELLOW}Creating example documents...${NC}"

# Encrypt some test documents
echo "Encrypting 'patent_quantum_001'..."
dfx canister call paillier_poc_backend encrypt_document '("patent_quantum_001", vec { blob "\00\01\02\03\04\05\06\07\08\09\0a\0b\0c\0d\0e\0f\10\11\12\13\14\15\16\17\18\19\1a\1b\1c\1d\1e\1f" })' > /dev/null 2>&1

echo "Encrypting 'patent_quantum_002'..."
dfx canister call paillier_poc_backend encrypt_document '("patent_quantum_002", vec { blob "\20\21\22\23\24\25\26\27\28\29\2a\2b\2c\2d\2e\2f\30\31\32\33\34\35\36\37\38\39\3a\3b\3c\3d\3e\3f" })' > /dev/null 2>&1

echo "Encrypting 'research_ai_model'..."
dfx canister call paillier_poc_backend encrypt_document '("research_ai_model", vec { blob "\40\41\42\43\44\45\46\47\48\49\4a\4b\4c\4d\4e\4f\50\51\52\53\54\55\56\57\58\59\5a\5b\5c\5d\5e\5f" })' > /dev/null 2>&1

echo -e "${GREEN}✓ Created 3 example documents${NC}"

# Get current stats
echo -e "\n${YELLOW}Current system status:${NC}"
dfx canister call paillier_poc_backend get_stats

# Create a simple HTTP server script
cat > serve_demo.sh << 'EOF'
#!/bin/bash
echo "Starting demo server on http://localhost:8080"
echo "Press Ctrl+C to stop"
python3 -m http.server 8080
EOF
chmod +x serve_demo.sh

# Print summary
echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    Setup Complete! 🎉                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Canister ID:${NC} $CANISTER_ID"
echo -e "${GREEN}vetKeys Mode:${NC} $VETKD_MODE"
echo -e "${GREEN}Documents Created:${NC} 3 example documents"
echo ""
echo -e "${YELLOW}To view the demo page:${NC}"
echo -e "1. Open in browser: ${BLUE}file://$(pwd)/demo_local.html${NC}"
echo -e "   OR"
echo -e "2. Serve locally: ${BLUE}./serve_demo.sh${NC}"
echo -e "   Then visit: ${BLUE}http://localhost:8080/demo_local.html${NC}"
echo ""
echo -e "${YELLOW}To test via terminal:${NC}"
echo -e "• Run tests: ${BLUE}./test_vetkd_integration.sh${NC}"
echo -e "• Monitor: ${BLUE}node monitor_performance_vetkd.js${NC}"
echo -e "• Compare docs: ${BLUE}dfx canister call paillier_poc_backend compare_documents '(\"patent_quantum_001\", \"patent_quantum_002\")'${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Open the demo page in your browser"
echo -e "2. Use the Commands tab to generate test commands"
echo -e "3. Run the commands in terminal to see results"
echo -e "4. Monitor performance with the monitoring script"