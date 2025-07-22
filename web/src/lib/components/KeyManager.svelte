<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { StoredKey } from '../crypto/keyStorage';
  
  export let keys: StoredKey[] = [];
  export let selectedKeyId: string | null = null;
  
  const dispatch = createEventDispatcher();
  
  let showImportDialog = false;
  let showGenerateDialog = false;
  let importName = '';
  let importNHex = '';
  let importGHex = '';
  let generateName = '';
  let generateBitLength = 512;
  let isGenerating = false;
  let fileInput: HTMLInputElement;
  
  function selectKey(keyId: string) {
    selectedKeyId = keyId;
    dispatch('keySelected', { keyId });
  }
  
  function formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  }
  
  async function downloadDemoKey() {
    const { DEMO_PUBLIC_KEY } = await import('../crypto/demoKeys');
    
    const demoKey = {
      name: 'Demo Public Key (POC)',
      publicKey: DEMO_PUBLIC_KEY,
      note: 'This is a demo key for testing. DO NOT use for production!',
      instructions: 'Import this key using the "Import Key" button'
    };
    
    const blob = new Blob([JSON.stringify(demoKey, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'demo-paillier-public-key.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  
  async function importKey() {
    if (!importName || !importNHex || !importGHex) {
      alert('Please fill in all fields');
      return;
    }
    
    dispatch('importKey', {
      name: importName,
      nHex: importNHex,
      gHex: importGHex
    });
    
    // Reset form
    importName = '';
    importNHex = '';
    importGHex = '';
    showImportDialog = false;
  }
  
  function deleteKey(keyId: string) {
    if (confirm('Are you sure you want to delete this key?')) {
      dispatch('deleteKey', { keyId });
    }
  }
  
  async function generateKeyPair() {
    if (!generateName) {
      alert('Please enter a name for the key');
      return;
    }
    
    isGenerating = true;
    
    try {
      const { PaillierKeyGenerator } = await import('../crypto/keyGenerator');
      
      // Generate the key pair
      const keyPair = await PaillierKeyGenerator.generateKeyPair(generateBitLength);
      
      // Export the keys
      const exported = PaillierKeyGenerator.exportPublicKey(keyPair.publicKey);
      
      // Store the public key
      dispatch('importKey', {
        name: generateName + ' (Generated)',
        nHex: exported.n,
        gHex: exported.g
      });
      
      // Download the full key pair
      const fullExport = PaillierKeyGenerator.exportKeyPair(keyPair);
      const blob = new Blob([fullExport], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${generateName.toLowerCase().replace(/\s+/g, '-')}-keypair.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      // Reset form
      generateName = '';
      generateBitLength = 512;
      showGenerateDialog = false;
    } catch (err) {
      alert('Failed to generate key: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      isGenerating = false;
    }
  }
  
  async function exportKey(key: StoredKey) {
    try {
      const keyData = {
        name: key.name,
        publicKey: {
          n: key.publicKey.n,
          g: key.publicKey.g
        },
        exportedAt: new Date().toISOString(),
        note: 'Public key only - can be shared safely'
      };
      
      const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${key.name.toLowerCase().replace(/\s+/g, '-')}-public-key.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to export key: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  }
  
  async function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      // Handle different key file formats
      let name: string;
      let n: string;
      let g: string;
      
      if (data.publicKey && data.publicKey.n && data.publicKey.g) {
        // Format from exported keys or generated keys
        name = data.name || file.name.replace('.json', '');
        n = data.publicKey.n;
        g = data.publicKey.g;
      } else if (data.n && data.g) {
        // Direct public key format
        name = data.name || file.name.replace('.json', '');
        n = data.n;
        g = data.g;
      } else {
        throw new Error('Invalid key file format. Expected publicKey.n and publicKey.g or n and g');
      }
      
      // Import the key
      dispatch('importKey', {
        name: name + ' (Uploaded)',
        nHex: n,
        gHex: g
      });
      
      // Reset file input
      if (fileInput) fileInput.value = '';
      
    } catch (err) {
      alert('Failed to upload key: ' + (err instanceof Error ? err.message : 'Invalid key file'));
      if (fileInput) fileInput.value = '';
    }
  }
</script>

<div class="key-manager">
  <div class="header">
    <h3 class="title">Encryption Keys</h3>
    <div class="actions">
      <button class="btn-secondary" on:click={downloadDemoKey}>
        Download Demo Key
      </button>
      <button class="btn-secondary" on:click={() => fileInput.click()}>
        Upload Key File
      </button>
      <input
        bind:this={fileInput}
        type="file"
        accept=".json"
        on:change={handleFileUpload}
        class="hidden"
      />
      <button class="btn-secondary" on:click={() => showGenerateDialog = true}>
        Generate Key
      </button>
      <button class="btn-primary" on:click={() => showImportDialog = true}>
        Import Key
      </button>
    </div>
  </div>
  
  {#if keys.length === 0}
    <div class="empty-state">
      <svg class="empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="11" width="18" height="10" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0110 0v4"></path>
      </svg>
      <p class="empty-text">No encryption keys found</p>
      <p class="empty-subtext">Import a public key to start encrypting documents</p>
    </div>
  {:else}
    <div class="key-list">
      {#each keys as key}
        <div class="key-item {selectedKeyId === key.id ? 'selected' : ''}">
          <button 
            class="key-info"
            on:click={() => selectKey(key.id)}
            type="button"
            aria-label="Select key {key.name}"
          >
            <div class="key-name">{key.name}</div>
            <div class="key-meta">
              Created: {formatDate(key.createdAt)}
              {#if key.lastUsed}
                · Last used: {formatDate(key.lastUsed)}
              {/if}
            </div>
          </button>
          <button 
            class="delete-btn"
            on:click|stopPropagation={() => deleteKey(key.id)}
            aria-label="Delete key {key.name}"
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
          <button
            class="export-btn"
            on:click|stopPropagation={() => exportKey(key)}
            aria-label="Export key {key.name}"
            type="button"
            title="Export public key"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
        </div>
      {/each}
    </div>
  {/if}
  
  {#if showImportDialog}
    <div 
      class="dialog-overlay"
      role="button"
      tabindex="0"
      on:click={() => showImportDialog = false}
      on:keydown={(e) => e.key === 'Escape' && (showImportDialog = false)}
      aria-label="Close dialog overlay"
    >
      <div 
        class="dialog"
        role="dialog"
        aria-labelledby="dialog-title"
        tabindex="-1"
        on:click|stopPropagation
        on:keydown|stopPropagation
      >
        <h4 id="dialog-title" class="dialog-title">Import Public Key</h4>
        
        <div class="form-group">
          <label for="key-name">Key Name</label>
          <input
            id="key-name"
            type="text"
            bind:value={importName}
            placeholder="My Public Key"
            class="input"
          />
        </div>
        
        <div class="form-group">
          <label for="key-n">Modulus (n) - Hex</label>
          <textarea
            id="key-n"
            bind:value={importNHex}
            placeholder="8b1a9953c2f3c3d3e3f3c3d3e3f3c3d3..."
            class="textarea"
            rows="3"
          ></textarea>
        </div>
        
        <div class="form-group">
          <label for="key-g">Generator (g) - Hex</label>
          <textarea
            id="key-g"
            bind:value={importGHex}
            placeholder="8b1a9953c2f3c3d3e3f3c3d3e3f3c3d4..."
            class="textarea"
            rows="3"
          ></textarea>
        </div>
        
        <div class="dialog-actions">
          <button class="btn-secondary" on:click={() => showImportDialog = false}>
            Cancel
          </button>
          <button class="btn-primary" on:click={importKey}>
            Import
          </button>
        </div>
      </div>
    </div>
  {/if}
  
  {#if showGenerateDialog}
    <div 
      class="dialog-overlay"
      role="button"
      tabindex="0"
      on:click={() => showGenerateDialog = false}
      on:keydown={(e) => e.key === 'Escape' && (showGenerateDialog = false)}
      aria-label="Close dialog overlay"
    >
      <div 
        class="dialog"
        role="dialog"
        aria-labelledby="generate-dialog-title"
        tabindex="-1"
        on:click|stopPropagation
        on:keydown|stopPropagation
      >
        <h4 id="generate-dialog-title" class="dialog-title">Generate New Key Pair</h4>
        
        <div class="warning-box">
          <svg class="warning-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <p class="warning-text">
            <strong>For Testing Only!</strong> Browser-generated keys are not suitable for production use.
            The private key will be downloaded to your device.
          </p>
        </div>
        
        <div class="form-group">
          <label for="gen-key-name">Key Name</label>
          <input
            id="gen-key-name"
            type="text"
            bind:value={generateName}
            placeholder="My Test Key"
            class="input"
            disabled={isGenerating}
          />
        </div>
        
        <div class="form-group">
          <label for="gen-bit-length">Key Size (bits)</label>
          <select
            id="gen-bit-length"
            bind:value={generateBitLength}
            class="input"
            disabled={isGenerating}
          >
            <option value={512}>512 bits (Fast, less secure)</option>
            <option value={1024}>1024 bits (Balanced)</option>
            <option value={2048}>2048 bits (Secure, slower)</option>
          </select>
        </div>
        
        <div class="dialog-actions">
          <button class="btn-secondary" on:click={() => showGenerateDialog = false} disabled={isGenerating}>
            Cancel
          </button>
          <button class="btn-primary" on:click={generateKeyPair} disabled={isGenerating}>
            {#if isGenerating}
              <span class="spinner"></span>
              Generating...
            {:else}
              Generate & Download
            {/if}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .key-manager {
    @apply bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6;
  }
  
  .header {
    @apply flex justify-between items-center mb-4;
  }
  
  .title {
    @apply text-lg font-semibold text-gray-800;
  }
  
  .actions {
    @apply flex gap-2;
  }
  
  .btn-primary {
    @apply px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors;
    @apply focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2;
    @apply font-medium shadow-sm cursor-pointer;
  }
  
  .btn-secondary {
    @apply px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors;
    @apply focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2;
    @apply font-medium shadow-sm cursor-pointer;
  }
  
  .empty-state {
    @apply text-center py-8;
  }
  
  .empty-icon {
    @apply mx-auto mb-4 text-gray-400;
  }
  
  .empty-text {
    @apply text-gray-700 font-medium mb-1;
  }
  
  .empty-subtext {
    @apply text-gray-500 text-sm;
  }
  
  .key-list {
    @apply space-y-2;
  }
  
  .key-item {
    @apply flex items-center justify-between p-4 border border-gray-200 rounded-lg;
    @apply hover:border-blue-300 hover:bg-blue-50 transition-all cursor-pointer;
  }
  
  .key-item.selected {
    @apply border-blue-500 bg-blue-50;
  }
  
  .key-info {
    @apply flex-1 text-left bg-transparent border-none p-0 cursor-pointer;
  }
  
  .key-name {
    @apply font-medium text-gray-800;
  }
  
  .key-meta {
    @apply text-sm text-gray-500 mt-1;
  }
  
  .delete-btn {
    @apply p-2 text-gray-400 hover:text-red-600 transition-colors;
    @apply focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 rounded;
  }
  
  .export-btn {
    @apply p-2 text-gray-400 hover:text-blue-600 transition-colors;
    @apply focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded;
  }
  
  .dialog-overlay {
    @apply fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50;
  }
  
  .dialog {
    @apply bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4;
  }
  
  .dialog-title {
    @apply text-xl font-semibold text-gray-800 mb-4;
  }
  
  .form-group {
    @apply mb-4;
  }
  
  .form-group label {
    @apply block text-sm font-medium text-gray-700 mb-1;
  }
  
  .input, .textarea {
    @apply w-full px-3 py-2 border border-gray-300 rounded-lg;
    @apply focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500;
  }
  
  .textarea {
    @apply font-mono text-sm;
  }
  
  .dialog-actions {
    @apply flex justify-end gap-2 mt-6;
  }
  
  .warning-box {
    @apply bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 flex items-start gap-3;
  }
  
  .warning-icon {
    @apply text-yellow-600 flex-shrink-0 mt-0.5;
  }
  
  .warning-text {
    @apply text-sm text-yellow-800;
  }
  
  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-right: 8px;
    vertical-align: middle;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>