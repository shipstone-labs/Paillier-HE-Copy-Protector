export interface TokenizedDocument {
  tokens: number[];
  tokenCount: number;
  originalLength: number;
  plainText?: string; // Optional, for debugging
}

export interface EncryptedToken {
  value: string; // Base64 encoded encrypted value
  index: number; // Original position in token array
}

export interface EncryptedDocument {
  id: string;
  encryptedTokens: EncryptedToken[];
  metadata: {
    tokenCount: number;
    originalLength: number;
    timestamp: number;
  };
}

export interface UploadStatus {
  stage: 'idle' | 'reading' | 'tokenizing' | 'encrypting' | 'uploading' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  error?: string;
}