#!/bin/bash

# Build script for frontend that reads dfx environment variables
# This is typically called by dfx during the build process

# Load environment variables from .env if it exists
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Build the frontend
npm run build

# The canister ID will be available as:
# - CANISTER_ID_PAILLIER_CANISTER (from dfx)
# - import.meta.env.VITE_CANISTER_ID_PAILLIER_CANISTER (in the app)