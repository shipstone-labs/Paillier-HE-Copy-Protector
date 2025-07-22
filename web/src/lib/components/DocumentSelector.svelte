<script lang="ts">
  import { onMount } from 'svelte';
  import { CanisterService, type DocumentMetadata } from '../api/canister';
  import type { HttpAgent } from '@dfinity/agent';
  
  export let agent: HttpAgent | null = null;
  export let canisterId: string = '';
  export let selectedOption: string = 'new';
  export let disabled: boolean = false;
  
  let documents: DocumentMetadata[] = [];
  let isLoading = true;
  let error: string | null = null;
  let canisterService: CanisterService | null = null;
  
  $: if (agent && canisterId) {
    initCanister();
  }
  
  async function initCanister() {
    if (!agent || !canisterId) return;
    
    try {
      canisterService = new CanisterService(canisterId);
      await canisterService.init(agent);
      await loadDocuments();
    } catch (err) {
      console.error('Failed to initialize canister:', err);
      error = err instanceof Error ? err.message : 'Failed to initialize canister';
      isLoading = false;
    }
  }
  
  async function loadDocuments() {
    if (!canisterService) return;
    
    isLoading = true;
    error = null;
    
    try {
      documents = await canisterService.listAllDocuments();
      documents.sort((a, b) => Number(b.timestamp - a.timestamp));
    } catch (err) {
      console.error('Failed to load documents:', err);
      error = err instanceof Error ? err.message : 'Failed to load documents';
    } finally {
      isLoading = false;
    }
  }
  
  function formatDate(timestamp: bigint): string {
    const date = new Date(Number(timestamp) / 1_000_000);
    return date.toLocaleString();
  }
  
  function truncatePrincipal(principal: string | any): string {
    const principalStr = String(principal);
    if (!principalStr || principalStr === 'undefined' || principalStr === 'null') {
      return 'Unknown';
    }
    if (principalStr.length <= 16) return principalStr;
    return `${principalStr.slice(0, 8)}...${principalStr.slice(-6)}`;
  }
</script>

<div class="document-selector">
  <h3 class="title">Document Actions</h3>
  
  {#if isLoading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading documents...</p>
    </div>
  {:else if error}
    <div class="error-message">
      <p>{error}</p>
    </div>
  {:else}
    <div class="options">
      <label class="option">
        <input
          type="radio"
          name="documentAction"
          value="new"
          bind:group={selectedOption}
          {disabled}
        />
        <span class="option-label">Add as new document</span>
      </label>
      
      {#if documents.length > 0}
        <div class="separator">Or compare with existing:</div>
        
        {#each documents as doc}
          <label class="option">
            <input
              type="radio"
              name="documentAction"
              value={doc.document_id}
              bind:group={selectedOption}
              {disabled}
            />
            <div class="option-content">
              <span class="option-label">{doc.title}</span>
              <span class="option-meta">
                {truncatePrincipal(doc.owner)} • {formatDate(doc.timestamp)}
              </span>
            </div>
          </label>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .document-selector {
    @apply p-6 bg-white border border-gray-200 rounded-lg mb-6;
  }
  
  .title {
    @apply text-lg font-semibold text-gray-800 mb-4;
  }
  
  .loading {
    @apply flex flex-col items-center justify-center py-8 text-gray-600;
  }
  
  .spinner {
    @apply w-8 h-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mb-4;
  }
  
  .error-message {
    @apply p-4 bg-red-50 border border-red-200 rounded-lg text-red-700;
  }
  
  .options {
    @apply space-y-3;
  }
  
  .option {
    @apply flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors;
  }
  
  .option input[type="radio"] {
    @apply mt-0.5 text-blue-600 focus:ring-blue-500;
  }
  
  .option-label {
    @apply font-medium text-gray-900;
  }
  
  .option-content {
    @apply flex-1;
  }
  
  .option-meta {
    @apply block text-sm text-gray-500 mt-1;
  }
  
  .separator {
    @apply text-sm text-gray-500 font-medium mt-4 mb-2;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>