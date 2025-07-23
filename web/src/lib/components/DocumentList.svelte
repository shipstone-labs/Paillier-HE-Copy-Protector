<script lang="ts">
  import { onMount } from 'svelte';
  import { CanisterService, type DocumentMetadata } from '../api/canister';
  import type { HttpAgent } from '@dfinity/agent';
  
  export let agent: HttpAgent | null = null;
  export let canisterId: string = '';
  export let onSelectDocument: (doc: DocumentMetadata) => void = () => {};
  
  let documents: DocumentMetadata[] = [];
  let isLoading = true;
  let error: string | null = null;
  let canisterService: CanisterService | null = null;
  
  $: if (agent && canisterId) {
    initCanister();
  }
  
  async function initCanister() {
    if (!agent || !canisterId) {
      console.log('DocumentList: Missing agent or canisterId', { agent: !!agent, canisterId });
      return;
    }
    
    try {
      console.log('DocumentList: Initializing canister service with ID:', canisterId);
      canisterService = new CanisterService(canisterId);
      await canisterService.init(agent);
      console.log('DocumentList: Canister service initialized');
      await loadDocuments();
    } catch (err) {
      console.error('DocumentList: Failed to initialize canister:', err);
      error = err instanceof Error ? err.message : 'Failed to initialize canister';
      isLoading = false;
    }
  }
  
  async function loadDocuments() {
    if (!canisterService) {
      console.log('DocumentList: No canister service available');
      return;
    }
    
    isLoading = true;
    error = null;
    
    try {
      console.log('DocumentList: Loading documents...');
      documents = await canisterService.listAllDocuments();
      console.log('DocumentList: Loaded documents:', documents);
      // Sort by timestamp, newest first
      documents.sort((a, b) => Number(b.timestamp - a.timestamp));
    } catch (err) {
      console.error('Failed to load documents:', err);
      error = err instanceof Error ? err.message : 'Failed to load documents';
    } finally {
      isLoading = false;
    }
  }
  
  function formatDate(timestamp: bigint): string {
    const date = new Date(Number(timestamp) / 1_000_000); // Convert nanoseconds to milliseconds
    return date.toLocaleString();
  }
  
  function truncatePrincipal(principal: string | any): string {
    // Ensure principal is a string
    const principalStr = String(principal);
    if (!principalStr || principalStr === 'undefined' || principalStr === 'null') {
      return 'Unknown';
    }
    if (principalStr.length <= 16) return principalStr;
    return `${principalStr.slice(0, 8)}...${principalStr.slice(-6)}`;
  }
  
  // Export loadDocuments so parent can call it
  export { loadDocuments };
</script>

<div class="document-list">
  <div class="header">
    <h3 class="title">All Documents</h3>
    {#if !isLoading}
      <button class="refresh-btn" on:click={loadDocuments} title="Refresh" aria-label="Refresh document list">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6"></path>
          <path d="M1 20v-6h6"></path>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
      </button>
    {/if}
  </div>
  
  {#if isLoading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading documents...</p>
    </div>
  {:else if error}
    <div class="error">
      <p>{error}</p>
      <button class="retry-btn" on:click={loadDocuments}>Try Again</button>
    </div>
  {:else if documents.length === 0}
    <div class="empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity="0.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
      </svg>
      <p>No documents found</p>
    </div>
  {:else}
    <div class="documents">
      {#each documents as doc}
        <button
          class="document-card"
          on:click={() => onSelectDocument(doc)}
          title="Click to compare with this document"
        >
          <div class="document-header">
            <h4 class="document-title">{doc.title}</h4>
            <span class="document-id">ID: {doc.document_id}</span>
          </div>
          <div class="document-meta">
            <span class="owner" title="Public Key N: {doc.public_key_n.slice(0, 20)}...">
              Owner: {truncatePrincipal(doc.owner)}
            </span>
            <span class="timestamp">{formatDate(doc.timestamp)}</span>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .document-list {
    @apply bg-white border border-gray-200 rounded-lg p-6;
  }
  
  .header {
    @apply flex items-center justify-between mb-4;
  }
  
  .title {
    @apply text-lg font-semibold text-gray-800;
  }
  
  .refresh-btn {
    @apply p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors;
    @apply focus:outline-none focus:ring-2 focus:ring-gray-400;
  }
  
  .loading {
    @apply flex flex-col items-center justify-center py-12 text-gray-600;
  }
  
  .spinner {
    @apply w-8 h-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mb-4;
  }
  
  .error {
    @apply text-center py-12;
  }
  
  .error p {
    @apply text-red-600 mb-4;
  }
  
  .retry-btn {
    @apply px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors;
    @apply focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2;
  }
  
  .empty {
    @apply flex flex-col items-center justify-center py-12 text-gray-400;
  }
  
  .empty svg {
    @apply mb-4;
  }
  
  .documents {
    @apply space-y-3 max-h-96 overflow-y-auto;
  }
  
  .document-card {
    @apply w-full p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-left;
    @apply border border-gray-200 hover:border-gray-300;
    @apply focus:outline-none focus:ring-2 focus:ring-blue-500;
  }
  
  .document-header {
    @apply flex items-start justify-between mb-2;
  }
  
  .document-title {
    @apply font-medium text-gray-900 flex-1 mr-2;
  }
  
  .document-id {
    @apply text-xs text-gray-500 font-mono;
  }
  
  .document-meta {
    @apply flex items-center justify-between text-sm text-gray-600;
  }
  
  .owner {
    @apply font-mono text-xs;
  }
  
  .timestamp {
    @apply text-xs;
  }
</style>