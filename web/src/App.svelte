<script lang="ts">
  import { onMount } from 'svelte';
  import MarkdownUpload from './lib/components/MarkdownUpload.svelte';
  import TokenPreview from './lib/components/TokenPreview.svelte';
  import KeyManager from './lib/components/KeyManager.svelte';
  import AuthButton from './lib/components/AuthButton.svelte';
  import DocumentSubmit from './lib/components/DocumentSubmit.svelte';
  import type { TokenizedDocument, EncryptedDocument } from './lib/types';
  import type { MarkdownTokenizer } from './lib/tokenizer';
  import type { EncryptionService } from './lib/crypto/encryptionService';
  import type { HttpAgent } from '@dfinity/agent';
  
  let tokenizer: MarkdownTokenizer | null = null;
  let encryptionService: EncryptionService | null = null;
  let uploadComponent: MarkdownUpload;
  let authButton: AuthButton;
  let tokenizedDocument: TokenizedDocument | null = null;
  let encryptedDocument: EncryptedDocument | null = null;
  let error: string | null = null;
  let selectedKeyId: string | null = null;
  let storedKeys: any[] = [];
  let isAuthenticated = false;
  let agent: HttpAgent | null = null;
  let submittedDocId: string | null = null;
  let comparisonResult: any = null;
  
  // Configure canister ID - dfx provides this during build
  const CANISTER_ID = import.meta.env.VITE_CANISTER_ID_PAILLIER_CANISTER || 'ryjl3-tyaaa-aaaaa-aaaba-cai';
  
  // Load stored keys on mount
  onMount(async () => {
    try {
      const { EncryptionService } = await import('./lib/crypto/encryptionService');
      const service = new EncryptionService();
      await service.init();
      storedKeys = await service.getStoredKeys();
      if (storedKeys.length > 0 && !selectedKeyId) {
        selectedKeyId = storedKeys[0].id;
      }
    } catch (err) {
      console.error('Failed to load keys on mount:', err);
    }
  });
  
  // Lazy load services only when needed
  async function initializeServices() {
    if (!tokenizer) {
      const { MarkdownTokenizer } = await import('./lib/tokenizer');
      tokenizer = new MarkdownTokenizer();
    }
    if (!encryptionService) {
      const { EncryptionService } = await import('./lib/crypto/encryptionService');
      encryptionService = new EncryptionService();
      await encryptionService.init();
      await loadStoredKeys();
    }
  }
  
  async function loadStoredKeys() {
    try {
      if (encryptionService) {
        storedKeys = await encryptionService.getStoredKeys();
        if (storedKeys.length > 0 && !selectedKeyId) {
          selectedKeyId = storedKeys[0].id;
        }
      }
    } catch (err) {
      console.error('Failed to load keys:', err);
    }
  }
  
  async function handleFileLoaded(event: CustomEvent<{ content: string; filename: string }>) {
    const { content, filename } = event.detail;
    error = null;
    
    // Initialize services on first use
    await initializeServices();
    
    // Update status
    uploadComponent.updateStatus({
      stage: 'tokenizing',
      progress: 40,
      message: 'Tokenizing document...'
    });
    
    try {
      // Tokenize the document
      const tokens = tokenizer!.tokenize(content);
      const plainText = content; // We could also get this from the tokenizer
      
      tokenizedDocument = {
        tokens,
        tokenCount: tokens.length,
        originalLength: content.length,
        plainText
      };
      
      // Update status
      uploadComponent.updateStatus({
        stage: 'encrypting',
        progress: 60,
        message: 'Ready to encrypt tokens...'
      });
      
      // Check if we have a key selected
      if (!selectedKeyId) {
        throw new Error('No encryption key selected. Please load or create a key first.');
      }
      
      const publicKey = await encryptionService!.getPublicKey(selectedKeyId);
      if (!publicKey) {
        throw new Error('Selected key not found');
      }
      
      // Encrypt the tokens
      const docId = `doc_${Date.now()}`;
      encryptedDocument = await encryptionService!.createEncryptedDocument(
        docId,
        tokens,
        publicKey,
        (progress) => {
          uploadComponent.updateStatus({
            stage: 'encrypting',
            progress: 60 + (progress * 0.3), // 60-90%
            message: `Encrypting tokens... ${progress}%`
          });
        }
      );
      
      uploadComponent.updateStatus({
        stage: 'complete',
        progress: 100,
        message: `Successfully encrypted ${filename}`
      });
      
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to tokenize document';
      uploadComponent.updateStatus({
        stage: 'error',
        progress: 0,
        message: 'Tokenization failed',
        error
      });
    }
  }
  
  async function handleImportKey(event: CustomEvent<{ name: string; nHex: string; gHex: string }>) {
    const { name, nHex, gHex } = event.detail;
    
    try {
      // Ensure services are initialized
      await initializeServices();
      
      await encryptionService!.importPublicKeyFromCanister(
        name,
        hexToUint8Array(nHex),
        hexToUint8Array(gHex)
      );
      await loadStoredKeys();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to import key';
    }
  }
  
  async function handleDeleteKey(event: CustomEvent<{ keyId: string }>) {
    const { keyId } = event.detail;
    
    try {
      // Ensure services are initialized
      await initializeServices();
      
      // Use the keyStorage from the encryption service
      const keyStorage = new (await import('./lib/crypto/keyStorage')).KeyStorage();
      await keyStorage.init();
      await keyStorage.deleteKey(keyId);
      
      // Reload keys
      await loadStoredKeys();
      
      // Update selected key if we deleted the currently selected one
      if (selectedKeyId === keyId) {
        selectedKeyId = storedKeys.length > 0 ? storedKeys[0].id : null;
      }
    } catch (err) {
      console.error('Delete key error:', err);
      error = err instanceof Error ? err.message : 'Failed to delete key';
    }
  }
  
  function hexToUint8Array(hex: string): Uint8Array {
    const cleanHex = hex.replace(/\s/g, '');
    const bytes = new Uint8Array(cleanHex.length / 2);
    
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
    }
    
    return bytes;
  }
  
  function handleAuthenticated(event: CustomEvent) {
    isAuthenticated = true;
    agent = authButton.getAuthService().getAgent();
  }
  
  function handleLogout() {
    isAuthenticated = false;
    agent = null;
    submittedDocId = null;
    comparisonResult = null;
  }
  
  function handleSubmitted(event: CustomEvent<{ documentId: string }>) {
    submittedDocId = event.detail.documentId;
    error = null;
  }
  
  function handleCompared(event: CustomEvent) {
    comparisonResult = event.detail;
    error = null;
  }
  
  function handleError(event: CustomEvent<{ message: string }>) {
    error = event.detail.message;
  }
  
  // Cleanup on component destroy
  import { onDestroy } from 'svelte';
  onDestroy(() => {
    if (tokenizer) {
      tokenizer.destroy();
    }
  });
</script>

<main class="min-h-screen bg-gray-50">
  <div class="container mx-auto px-4 py-8">
    <header class="mb-12">
      <div class="flex justify-between items-start mb-6">
        <div>
          <h1 class="text-4xl font-bold text-gray-900 mb-4">
            Paillier HE Copy Protector
          </h1>
          <p class="text-lg text-gray-600 max-w-2xl">
            Upload a markdown document to tokenize and encrypt it using homomorphic encryption.
            The encrypted tokens can be compared without decryption.
          </p>
        </div>
        <AuthButton 
          bind:this={authButton}
          on:authenticated={handleAuthenticated}
          on:logout={handleLogout}
          on:error={handleError}
        />
      </div>
    </header>
    
    <div class="max-w-4xl mx-auto">
      <KeyManager
        keys={storedKeys}
        bind:selectedKeyId
        on:keySelected={({ detail }) => selectedKeyId = detail.keyId}
        on:importKey={handleImportKey}
        on:deleteKey={handleDeleteKey}
      />
      
      <MarkdownUpload
        bind:this={uploadComponent}
        on:fileLoaded={handleFileLoaded}
      />
      
      {#if error}
        <div class="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p class="text-red-700">Error: {error}</p>
        </div>
      {/if}
      
      {#if tokenizedDocument}
        <TokenPreview document={tokenizedDocument} />
      {/if}
      
      {#if encryptedDocument}
        <div class="mt-6 p-6 bg-green-50 border border-green-200 rounded-lg">
          <h3 class="text-lg font-semibold text-green-800 mb-2">Encryption Complete</h3>
          <p class="text-green-700">
            Document ID: <code class="bg-green-100 px-2 py-1 rounded">{encryptedDocument.id}</code>
          </p>
          <p class="text-green-700 mt-2">
            Encrypted {encryptedDocument.metadata.tokenCount} tokens successfully.
          </p>
        </div>
        
        {#if isAuthenticated}
          <DocumentSubmit
            {encryptedDocument}
            {agent}
            canisterId={CANISTER_ID}
            on:submitted={handleSubmitted}
            on:compared={handleCompared}
            on:error={handleError}
          />
        {:else}
          <div class="mt-6 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p class="text-yellow-800">
              Please login with Internet Identity to submit documents to the canister.
            </p>
          </div>
        {/if}
      {/if}
      
      {#if submittedDocId}
        <div class="mt-6 p-6 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 class="text-lg font-semibold text-blue-800 mb-2">Document Stored</h3>
          <p class="text-blue-700">
            Your document has been stored with ID: 
            <code class="bg-blue-100 px-2 py-1 rounded">{submittedDocId}</code>
          </p>
          <p class="text-blue-700 mt-2 text-sm">
            You can use this ID to compare other documents against it.
          </p>
        </div>
      {/if}
      
      {#if comparisonResult}
        <div class="mt-6 p-6 bg-purple-50 border border-purple-200 rounded-lg">
          <h3 class="text-lg font-semibold text-purple-800 mb-2">Comparison Results</h3>
          <div class="space-y-2 text-purple-700">
            <p>
              Document compared: <code class="bg-purple-100 px-2 py-1 rounded">{comparisonResult.documentId}</code>
            </p>
            <p>
              Mode: <span class="font-medium">{comparisonResult.mode}</span>
            </p>
            {#if comparisonResult.result.similarity_score.length > 0}
              <p>
                Similarity: <span class="font-bold">{(comparisonResult.result.similarity_score[0] * 100).toFixed(2)}%</span>
              </p>
            {/if}
            {#if comparisonResult.result.plagiarism_score.length > 0}
              <p>
                Plagiarism Score: <span class="font-bold">{(comparisonResult.result.plagiarism_score[0] * 100).toFixed(2)}%</span>
              </p>
            {/if}
            <p>
              Tokens compared: {comparisonResult.result.tokens_compared}
            </p>
          </div>
        </div>
      {/if}
    </div>
    
    <footer class="mt-16 text-center text-sm text-gray-500">
      <p>Using OpenAI's cl100k_base tokenizer • Paillier homomorphic encryption</p>
    </footer>
  </div>
</main>

<style>
  /* Global styles are in app.css with Tailwind */
</style>