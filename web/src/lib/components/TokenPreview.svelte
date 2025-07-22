<script lang="ts">
  import type { TokenizedDocument } from '../types';
  
  export let document: TokenizedDocument | null = null;
  export let maxTokensToShow = 50;
  
  $: displayTokens = document?.tokens.slice(0, maxTokensToShow) || [];
  $: hasMore = document && document.tokens.length > maxTokensToShow;
</script>

{#if document}
  <div class="token-preview">
    <div class="preview-header">
      <h3 class="preview-title">Token Preview</h3>
      <div class="token-stats">
        <span class="stat">
          <strong>Total Tokens:</strong> {document.tokenCount}
        </span>
        <span class="stat">
          <strong>Original Length:</strong> {document.originalLength} chars
        </span>
      </div>
    </div>
    
    <div class="token-grid">
      {#each displayTokens as token, index}
        <div class="token-item" title="Token ID: {token}">
          <span class="token-index">{index}:</span>
          <span class="token-value">{token}</span>
        </div>
      {/each}
      
      {#if hasMore}
        <div class="more-indicator">
          ... and {document.tokens.length - maxTokensToShow} more tokens
        </div>
      {/if}
    </div>
    
    {#if document.plainText}
      <details class="text-preview">
        <summary class="preview-toggle">Show extracted text</summary>
        <pre class="extracted-text">{document.plainText}</pre>
      </details>
    {/if}
  </div>
{:else}
  <div class="no-preview">
    <p class="text-gray-500 text-center">No document tokenized yet</p>
  </div>
{/if}

<style>
  .token-preview {
    @apply bg-gray-50 rounded-lg p-6 mt-6;
  }
  
  .preview-header {
    @apply mb-4;
  }
  
  .preview-title {
    @apply text-lg font-semibold text-gray-800 mb-2;
  }
  
  .token-stats {
    @apply flex gap-4 text-sm text-gray-600;
  }
  
  .stat {
    @apply flex gap-1;
  }
  
  .token-grid {
    @apply grid grid-cols-5 md:grid-cols-8 lg:grid-cols-10 gap-2 mt-4;
  }
  
  .token-item {
    @apply bg-white border border-gray-200 rounded px-2 py-1 text-xs font-mono;
    @apply hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-help;
  }
  
  .token-index {
    @apply text-gray-500 mr-1;
  }
  
  .token-value {
    @apply text-gray-800;
  }
  
  .more-indicator {
    @apply col-span-full text-center text-sm text-gray-500 italic mt-2;
  }
  
  .text-preview {
    @apply mt-4;
  }
  
  .preview-toggle {
    @apply cursor-pointer text-sm text-blue-600 hover:text-blue-700;
    @apply focus:outline-none focus:underline;
  }
  
  .extracted-text {
    @apply mt-2 p-4 bg-white border border-gray-200 rounded text-sm;
    @apply whitespace-pre-wrap break-words max-h-64 overflow-y-auto;
  }
  
  .no-preview {
    @apply py-8;
  }
</style>