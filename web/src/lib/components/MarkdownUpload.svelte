<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { UploadStatus } from '../types';
  
  const dispatch = createEventDispatcher();
  
  let fileInput: HTMLInputElement;
  let dragActive = false;
  let status: UploadStatus = {
    stage: 'idle',
    progress: 0,
    message: 'Ready to upload'
  };
  
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragActive = true;
  }
  
  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
  }
  
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
    
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }
  
  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      handleFile(input.files[0]);
    }
  }
  
  async function handleFile(file: File) {
    if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown')) {
      status = {
        stage: 'error',
        progress: 0,
        message: 'Please upload a Markdown file (.md or .markdown)',
        error: 'Invalid file type'
      };
      return;
    }
    
    status = {
      stage: 'reading',
      progress: 20,
      message: 'Reading file...'
    };
    
    try {
      const content = await file.text();
      dispatch('fileLoaded', { content, filename: file.name });
    } catch (error) {
      status = {
        stage: 'error',
        progress: 0,
        message: 'Failed to read file',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  export function updateStatus(newStatus: UploadStatus) {
    status = newStatus;
  }
</script>

<div class="upload-container">
  <div 
    class="upload-area {dragActive ? 'drag-active' : ''} {status.stage === 'error' ? 'error' : ''}"
    role="region"
    aria-label="File upload area"
    on:dragover={handleDragOver}
    on:dragleave={handleDragLeave}
    on:drop={handleDrop}
  >
    {#if status.stage === 'idle'}
      <svg class="upload-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      
      <h3 class="upload-title">Upload Markdown Document</h3>
      <p class="upload-subtitle">Drag and drop your .md file here or click to browse</p>
      
      <input
        bind:this={fileInput}
        type="file"
        accept=".md,.markdown"
        on:change={handleFileSelect}
        class="hidden"
      />
      
      <button 
        class="browse-button"
        on:click={() => fileInput.click()}
      >
        Browse Files
      </button>
    {:else}
      <div class="status-display">
        {#if status.stage === 'error'}
          <svg class="status-icon error" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        {:else if status.stage === 'complete'}
          <svg class="status-icon success" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        {:else}
          <div class="spinner"></div>
        {/if}
        
        <p class="status-message">{status.message}</p>
        
        {#if status.stage !== 'error' && status.stage !== 'complete'}
          <div class="progress-bar">
            <div class="progress-fill" style="width: {status.progress}%"></div>
          </div>
        {/if}
        
        {#if status.error}
          <p class="error-message">{status.error}</p>
        {/if}
        
        {#if status.stage === 'error' || status.stage === 'complete'}
          <button 
            class="reset-button"
            on:click={() => {
              status = { stage: 'idle', progress: 0, message: 'Ready to upload' };
              if (fileInput) fileInput.value = '';
            }}
          >
            Upload Another File
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .upload-container {
    @apply w-full max-w-2xl mx-auto;
  }
  
  .upload-area {
    @apply border-2 border-dashed border-gray-300 rounded-lg p-12 text-center transition-all;
    @apply hover:border-gray-400 cursor-pointer;
  }
  
  .upload-area.drag-active {
    @apply border-blue-500 bg-blue-50;
  }
  
  .upload-area.error {
    @apply border-red-300 bg-red-50;
  }
  
  .upload-icon {
    @apply mx-auto mb-4 text-gray-400;
  }
  
  .upload-title {
    @apply text-xl font-semibold text-gray-700 mb-2;
  }
  
  .upload-subtitle {
    @apply text-gray-500 mb-6;
  }
  
  .browse-button {
    @apply px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors;
    @apply focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2;
    @apply font-medium shadow-sm cursor-pointer;
  }
  
  .hidden {
    @apply sr-only;
  }
  
  .status-display {
    @apply flex flex-col items-center;
  }
  
  .status-icon {
    @apply mb-4;
  }
  
  .status-icon.error {
    @apply text-red-500;
  }
  
  .status-icon.success {
    @apply text-green-500;
  }
  
  .spinner {
    @apply w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mb-4;
  }
  
  .status-message {
    @apply text-lg font-medium text-gray-700 mb-4;
  }
  
  .progress-bar {
    @apply w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-4;
  }
  
  .progress-fill {
    @apply h-full bg-blue-600 transition-all duration-300 ease-out;
  }
  
  .error-message {
    @apply text-sm text-red-600 mb-4;
  }
  
  .reset-button {
    @apply px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors;
    @apply focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2;
    @apply font-medium shadow-sm cursor-pointer;
  }
</style>