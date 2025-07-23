<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { CanisterService, type DocumentMetadata, type ComparisonMode } from '../api/canister';
  import type { HttpAgent } from '@dfinity/agent';
  import type { EncryptedDocument } from '../types';
  
  export let encryptedDocument: EncryptedDocument | null = null;
  export let tokenizedDocument: any = null; // Need the plain tokens for re-encryption
  export let agent: HttpAgent | null = null;
  export let canisterId: string = '';
  
  const dispatch = createEventDispatcher();
  
  let documents: DocumentMetadata[] = [];
  let isSubmitting = false;
  let error: string | null = null;
  let canisterService: CanisterService | null = null;
  export let selectedOption: string = 'new'; // 'new' or document ID
  export let documentTitle = '';
  
  $: if (agent && canisterId) {
    initCanister();
  }
  
  $: actionButtonText = selectedOption === 'new' ? 'Encrypt and Store Document' : 'Encrypt and Compare Documents';
  
  async function initCanister() {
    if (!agent || !canisterId) return;
    
    try {
      canisterService = new CanisterService(canisterId);
      await canisterService.init(agent);
    } catch (err) {
      console.error('Failed to initialize canister:', err);
      error = err instanceof Error ? err.message : 'Failed to initialize canister';
    }
  }
  
  async function handleAction() {
    if (!encryptedDocument || !canisterService) return;
    
    if (selectedOption === 'new') {
      await storeNewDocument();
    } else {
      await compareWithDocument();
    }
  }
  
  async function storeNewDocument() {
    if (!documentTitle.trim()) {
      error = 'Please enter a document title';
      return;
    }
    
    isSubmitting = true;
    error = null;
    
    try {
      // Convert encrypted tokens to Uint8Array format
      const tokenArrays = encryptedDocument!.encryptedTokens.map(token => {
        const binary = atob(token.value);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
      });
      
      // Get the public key from the encrypted document metadata
      const publicKeyN = encryptedDocument!.metadata.publicKey.n;
      const publicKeyG = encryptedDocument!.metadata.publicKey.g;
      
      const result = await canisterService!.storeDocument(
        documentTitle.trim(), 
        tokenArrays,
        publicKeyN,
        publicKeyG
      );
      
      if (result.success) {
        dispatch('submitted', { documentId: result.document_id, title: documentTitle });
        documentTitle = '';
        await loadDocuments(); // Refresh the list
      } else {
        error = result.message;
      }
    } catch (err) {
      console.error('Failed to store document:', err);
      error = err instanceof Error ? err.message : 'Failed to store document';
    } finally {
      isSubmitting = false;
    }
  }
  
  async function compareWithDocument() {
    if (!tokenizedDocument || !canisterService) {
      error = 'Original document tokens not available for re-encryption';
      return;
    }
    
    // Load documents if not already loaded
    if (documents.length === 0) {
      try {
        documents = await canisterService.listAllDocuments();
      } catch (err) {
        error = 'Failed to load documents';
        return;
      }
    }
    
    const selectedDoc = documents.find(d => d.document_id === selectedOption);
    if (!selectedDoc) {
      error = 'Selected document not found';
      return;
    }
    
    isSubmitting = true;
    error = null;
    
    try {
      // Re-encrypt the document with the selected document's public key
      dispatch('reencrypt', {
        publicKey: {
          n: selectedDoc.public_key_n,
          g: selectedDoc.public_key_g
        },
        targetDocumentId: selectedDoc.document_id,
        targetDocumentTitle: selectedDoc.title
      });
    } catch (err) {
      console.error('Failed to initiate re-encryption:', err);
      error = err instanceof Error ? err.message : 'Failed to compare documents';
      isSubmitting = false;
    }
  }
</script>

{#if agent}
  <div class="document-action">
    <button
      class="action-btn"
      on:click={handleAction}
      disabled={!encryptedDocument || isSubmitting || (selectedOption === 'new' && !documentTitle.trim())}
    >
      {#if isSubmitting}
        <span class="spinner"></span>
        Processing...
      {:else if !encryptedDocument}
        Upload and encrypt a document first
      {:else}
        {actionButtonText}
      {/if}
    </button>
  </div>
{/if}

<style>
  .document-action {
    @apply mt-6;
  }
  
  .spinner {
    @apply w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin;
  }
  
  .action-btn {
    @apply w-full flex items-center justify-center gap-2 px-4 py-2;
    @apply bg-blue-600 text-white rounded-lg font-medium;
    @apply hover:bg-blue-700 transition-colors;
    @apply focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2;
    @apply disabled:opacity-50 disabled:cursor-not-allowed;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>