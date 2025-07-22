<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { EncryptedDocument } from '../types';
  import { CanisterService, type ComparisonMode } from '../api/canister';
  import type { HttpAgent } from '@dfinity/agent';
  
  export let encryptedDocument: EncryptedDocument | null = null;
  export let agent: HttpAgent | null = null;
  export let canisterId: string = '';
  
  const dispatch = createEventDispatcher();
  
  let isSubmitting = false;
  let showCompareDialog = false;
  let compareDocId = '';
  let comparisonMode: 'Duplicate' | 'Plagiarism' | 'Both' = 'Both';
  let canisterService: CanisterService | null = null;
  
  $: if (agent && canisterId) {
    initCanister();
  }
  
  async function initCanister() {
    if (!agent || !canisterId) return;
    
    canisterService = new CanisterService(canisterId);
    await canisterService.init(agent);
  }
  
  async function submitDocument() {
    if (!encryptedDocument || !canisterService) return;
    
    isSubmitting = true;
    
    try {
      // Convert encrypted tokens to Uint8Array format
      const tokenArrays = encryptedDocument.encryptedTokens.map(token => {
        // Decode base64 to Uint8Array
        const binary = atob(token.value);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
      });
      
      const result = await canisterService.storeDocument(tokenArrays);
      
      if (result.success) {
        dispatch('submitted', { documentId: result.document_id });
      } else {
        dispatch('error', { message: result.message });
      }
    } catch (error) {
      console.error('Failed to submit document:', error);
      dispatch('error', { 
        message: error instanceof Error ? error.message : 'Failed to submit document' 
      });
    } finally {
      isSubmitting = false;
    }
  }
  
  async function compareWithDocument() {
    if (!encryptedDocument || !canisterService || !compareDocId) return;
    
    isSubmitting = true;
    
    try {
      // Convert encrypted tokens to Uint8Array format
      const tokenArrays = encryptedDocument.encryptedTokens.map(token => {
        const binary = atob(token.value);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
      });
      
      const mode: ComparisonMode = { [comparisonMode]: null } as ComparisonMode;
      const result = await canisterService.compareWithDocument(compareDocId, tokenArrays, mode);
      
      if (result.success) {
        dispatch('compared', { 
          result,
          documentId: compareDocId,
          mode: comparisonMode 
        });
      } else {
        dispatch('error', { message: result.message });
      }
      
      showCompareDialog = false;
      compareDocId = '';
    } catch (error) {
      console.error('Failed to compare document:', error);
      dispatch('error', { 
        message: error instanceof Error ? error.message : 'Failed to compare document' 
      });
    } finally {
      isSubmitting = false;
    }
  }
</script>

{#if encryptedDocument && agent}
  <div class="submit-container">
    <h3 class="title">Submit to Canister</h3>
    
    <div class="actions">
      <button
        class="btn-primary"
        on:click={submitDocument}
        disabled={isSubmitting || !canisterService}
      >
        {#if isSubmitting}
          <span class="spinner"></span>
          Submitting...
        {:else}
          <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          Store Document
        {/if}
      </button>
      
      <button
        class="btn-secondary"
        on:click={() => showCompareDialog = true}
        disabled={isSubmitting || !canisterService}
      >
        <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        Compare with Existing
      </button>
    </div>
    
    {#if !canisterService}
      <p class="warning">Waiting for canister connection...</p>
    {/if}
  </div>
  
  {#if showCompareDialog}
    <div 
      class="dialog-overlay"
      role="button"
      tabindex="0"
      on:click={() => showCompareDialog = false}
      on:keydown={(e) => e.key === 'Escape' && (showCompareDialog = false)}
      aria-label="Close dialog overlay"
    >
      <div 
        class="dialog"
        role="dialog"
        aria-labelledby="compare-dialog-title"
        tabindex="-1"
        on:click|stopPropagation
        on:keydown|stopPropagation
      >
        <h4 id="compare-dialog-title" class="dialog-title">Compare with Document</h4>
        
        <div class="form-group">
          <label for="doc-id">Document ID</label>
          <input
            id="doc-id"
            type="text"
            bind:value={compareDocId}
            placeholder="doc_1234567890"
            class="input"
          />
        </div>
        
        <div class="form-group">
          <label for="comparison-mode">Comparison Mode</label>
          <select
            id="comparison-mode"
            bind:value={comparisonMode}
            class="input"
          >
            <option value="Both">Both (Duplicate & Plagiarism)</option>
            <option value="Duplicate">Duplicate Detection Only</option>
            <option value="Plagiarism">Plagiarism Detection Only</option>
          </select>
        </div>
        
        <div class="dialog-actions">
          <button class="btn-secondary" on:click={() => showCompareDialog = false}>
            Cancel
          </button>
          <button 
            class="btn-primary" 
            on:click={compareWithDocument}
            disabled={!compareDocId || isSubmitting}
          >
            Compare
          </button>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .submit-container {
    @apply mt-6 p-6 bg-white border border-gray-200 rounded-lg;
  }
  
  .title {
    @apply text-lg font-semibold text-gray-800 mb-4;
  }
  
  .actions {
    @apply flex gap-3;
  }
  
  .btn-primary {
    @apply flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg;
    @apply hover:bg-blue-700 transition-colors;
    @apply focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2;
    @apply disabled:opacity-50 disabled:cursor-not-allowed;
  }
  
  .btn-secondary {
    @apply flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg;
    @apply hover:bg-gray-300 transition-colors;
    @apply focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2;
    @apply disabled:opacity-50 disabled:cursor-not-allowed;
  }
  
  .icon {
    @apply w-4 h-4;
  }
  
  .warning {
    @apply mt-3 text-sm text-yellow-600;
  }
  
  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
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
  
  .input {
    @apply w-full px-3 py-2 border border-gray-300 rounded-lg;
    @apply focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500;
  }
  
  .dialog-actions {
    @apply flex justify-end gap-2 mt-6;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>