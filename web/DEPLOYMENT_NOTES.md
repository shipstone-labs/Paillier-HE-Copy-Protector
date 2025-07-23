# Paillier HE Copy Protector - Deployment Notes

## Current Status (2025-07-22)

### Working Features
1. **Key Management**
   - Generate Paillier encryption keys in browser (for testing)
   - Import keys manually (paste n and g values)
   - Upload key files (JSON format)
   - Download demo keys
   - Store keys in IndexedDB
   - Keys persist across page refreshes (fixed with onMount)

2. **Document Processing**
   - Upload markdown documents
   - Tokenize using OpenAI's cl100k_base encoding
   - Preview tokenized content
   - Encrypt tokens using selected Paillier public key

3. **UI/UX**
   - Tailwind CSS v3 styling (downgraded from v4 due to @apply issues)
   - Dynamic imports for code splitting (reduces initial bundle from 5.6MB to ~250KB)
   - Internet Identity authentication integration

4. **Canister Backend**
   - Store encrypted documents
   - Compare documents for duplicates
   - Plagiarism detection with n-gram analysis
   - Configurable thresholds
   - Per-user document storage

### Known Issues

#### 1. Canister Not Found Error
```
Failed to compare document: ProtocolError: HTTP request failed:
  Status: 400 ()
  Headers: [["x-ic-canister-id","u6s2n-gx777-77774-qaaba-cai"]]
  Body: error: canister_not_found
```

**Possible Causes:**
- Mismatch between local and production canister IDs
- The canister ID in the error (u6s2n-gx777-77774-qaaba-cai) might be:
  - A local canister ID that doesn't exist in production
  - A production canister ID being used in local development
  - An outdated canister ID

**Debug Steps:**
1. Check `.dfx/local/canister_ids.json` for local canister IDs
2. Check `canister_ids.json` for production canister IDs
3. Verify environment variable: `CANISTER_ID_PAILLIER_CANISTER`
4. Check if running against local replica (`dfx start`) or IC mainnet

**Root Cause Found:**
The auth.ts file uses `process.env.NODE_ENV` which doesn't exist in browser:
```javascript
host: process.env.NODE_ENV === 'production' 
  ? 'https://ic0.app' 
  : 'http://localhost:4943',
```

This needs to be replaced with an environment variable that Vite can handle:
```javascript
host: import.meta.env.PROD 
  ? 'https://ic0.app' 
  : 'http://localhost:4943',
```

#### 2. Key Deletion Issue
- Delete button might not work for uploaded keys
- Added debugging in `handleDeleteKey` with console.error
- Ensured services are initialized before deletion

### Environment Configuration

The app expects canister ID in this format:
```javascript
const CANISTER_ID = import.meta.env.VITE_CANISTER_ID_PAILLIER_CANISTER || 'ryjl3-tyaaa-aaaaa-aaaba-cai';
```

During `dfx deploy`, the environment variable is set as:
```
CANISTER_ID_PAILLIER_CANISTER=<actual-canister-id>
```

Vite prefixes it with `VITE_` during build.

### Deployment Commands

#### Local Development
```bash
# Start local replica
dfx start --clean

# Deploy canisters locally
dfx deploy

# The web canister build command will receive:
# CANISTER_ID_PAILLIER_CANISTER=<local-canister-id>
```

#### Production Deployment
```bash
# Deploy to IC mainnet
dfx deploy --network ic

# This will use production canister IDs from canister_ids.json
```

### File Structure
```
web/
├── src/
│   ├── App.svelte (main app with canister ID configuration)
│   ├── lib/
│   │   ├── components/
│   │   │   ├── KeyManager.svelte (key upload/delete/management)
│   │   │   ├── AuthButton.svelte (Internet Identity)
│   │   │   └── DocumentSubmit.svelte (canister interaction)
│   │   ├── crypto/
│   │   │   ├── keyStorage.ts (IndexedDB)
│   │   │   ├── encryptionService.ts
│   │   │   └── keyGenerator.ts
│   │   └── api/
│   │       └── canisterClient.ts (actor creation)
│   └── index.html
├── vite.config.ts (environment variable injection)
└── postcss.config.js (Tailwind v3 config)
```

### Immediate Fixes Needed

1. **Fix environment detection in auth.ts:**
   ```typescript
   // Replace process.env.NODE_ENV with import.meta.env.PROD
   const INTERNET_IDENTITY_URL = 
     import.meta.env.PROD 
       ? 'https://identity.ic0.app'
       : 'http://localhost:4943?canisterId=rdmx6-jaaaa-aaaaa-aaadq-cai';
   
   // In setupAgent():
   host: import.meta.env.PROD 
     ? 'https://ic0.app' 
     : 'http://localhost:4943',
   ```

2. **Add local canister check:**
   ```typescript
   // In development, also check if canister is running
   if (!import.meta.env.PROD) {
     await agent.fetchRootKey();
   }
   ```

### Next Steps to Debug

1. **Check Canister Status:**
   ```bash
   dfx canister status paillier-canister
   ```

2. **Verify Canister ID:**
   ```bash
   # Local
   cat .dfx/local/canister_ids.json
   
   # Production
   cat canister_ids.json
   ```

3. **Test Direct API Call:**
   ```javascript
   // In browser console
   const actor = // ... create actor with correct canister ID
   await actor.get_stats()
   ```

4. **Check Network:**
   - Local: Uses `http://localhost:4943`
   - Production: Uses `https://ic0.app`

### CSS/Styling Issues
- Buttons appeared as plain text due to Tailwind v4 @apply issues
- Resolved by downgrading to Tailwind v3
- All button styles use direct Tailwind classes now

### Security Considerations
- Browser-generated keys are marked "for testing only"
- Private keys are never sent to canister
- Only public keys are used for encryption
- Document comparison happens on encrypted data

## Summary of Current State

The application is functionally complete with the following capabilities:
1. ✅ Markdown document tokenization using OpenAI's tokenizer
2. ✅ Client-side Paillier homomorphic encryption
3. ✅ Key management with multiple import/export options
4. ✅ Internet Identity authentication
5. ✅ Canister backend for encrypted document storage and comparison
6. ✅ Both duplicate detection and plagiarism detection modes

### Issues to Fix:
1. ❌ Environment detection using `process.env.NODE_ENV` (should use `import.meta.env.PROD`)
2. ❌ Canister not found error (likely due to wrong host URL)
3. ⚠️ Key deletion might have issues with uploaded keys

### To Run Locally:
```bash
# Terminal 1: Start local replica
dfx start --clean

# Terminal 2: Deploy canisters
dfx deploy

# Terminal 3: Start dev server
cd web
npm run dev
```

### To Deploy to Production:
```bash
# Deploy to IC mainnet
dfx deploy --network ic

# Build web app for production
cd web
npm run build
```

The main issue preventing the app from working is the incorrect environment detection causing the wrong host URL to be used for canister communication.