import { Actor, HttpAgent } from '@dfinity/agent';
import { IDL } from '@dfinity/candid';
import type { EncryptedToken } from '../types';

// Candid interface definition
const EncryptedDocument = IDL.Record({
  tokens: IDL.Vec(IDL.Vec(IDL.Nat8)),
  timestamp: IDL.Nat64,
  owner: IDL.Principal,
  title: IDL.Opt(IDL.Text),
  public_key_n: IDL.Text,
  public_key_g: IDL.Text,
});

const StoreResult = IDL.Record({
  document_id: IDL.Text,
  success: IDL.Bool,
  message: IDL.Text,
});

const DocumentMetadata = IDL.Record({
  document_id: IDL.Text,
  title: IDL.Text,
  owner: IDL.Principal,
  timestamp: IDL.Nat64,
  public_key_n: IDL.Text,
  public_key_g: IDL.Text,
});

const CompareResult = IDL.Record({
  similarity_score: IDL.Opt(IDL.Float64),
  tokens_compared: IDL.Nat32,
  success: IDL.Bool,
  message: IDL.Text,
  plagiarism_score: IDL.Opt(IDL.Float64),
});

const ComparisonMode = IDL.Variant({
  Duplicate: IDL.Null,
  Plagiarism: IDL.Null,
  Both: IDL.Null,
});

const Stats = IDL.Record({
  total_documents: IDL.Nat64,
  memory_used_bytes: IDL.Nat64,
  max_documents: IDL.Nat32,
  max_tokens_per_document: IDL.Nat32,
  duplicate_threshold: IDL.Float64,
  check_all_duplicates: IDL.Bool,
  fingerprint_size: IDL.Nat32,
  fingerprint_threshold: IDL.Float64,
});

const ConfigUpdate = IDL.Record({
  max_documents: IDL.Opt(IDL.Nat32),
  max_tokens_per_document: IDL.Opt(IDL.Nat32),
  duplicate_threshold: IDL.Opt(IDL.Float64),
  check_all_duplicates: IDL.Opt(IDL.Bool),
  fingerprint_size: IDL.Opt(IDL.Nat32),
  fingerprint_threshold: IDL.Opt(IDL.Float64),
});

const idlFactory = ({ IDL }: { IDL: any }) => {
  return IDL.Service({
    // Update methods
    store_document: IDL.Func([IDL.Text, IDL.Vec(IDL.Vec(IDL.Nat8)), IDL.Text, IDL.Text], [StoreResult], []),
    compare_documents: IDL.Func([IDL.Text, IDL.Text], [CompareResult], []),
    compare_with_document: IDL.Func(
      [IDL.Text, IDL.Vec(IDL.Vec(IDL.Nat8)), IDL.Opt(ComparisonMode)],
      [CompareResult],
      []
    ),
    update_config: IDL.Func(
      [ConfigUpdate],
      [IDL.Variant({ Ok: IDL.Text, Err: IDL.Text })],
      []
    ),
    
    // Query methods
    list_my_documents: IDL.Func([], [IDL.Vec(IDL.Text)], ['query']),
    list_all_documents: IDL.Func([], [IDL.Vec(DocumentMetadata)], ['query']),
    get_stats: IDL.Func([], [Stats], ['query']),
  });
};

// Types for the canister interface
export interface StoreResult {
  document_id: string;
  success: boolean;
  message: string;
}

export interface DocumentMetadata {
  document_id: string;
  title: string;
  owner: string;
  timestamp: bigint;
  public_key_n: string;
  public_key_g: string;
}

export interface CompareResult {
  similarity_score: [number] | [];
  tokens_compared: number;
  success: boolean;
  message: string;
  plagiarism_score: [number] | [];
}

export type ComparisonMode = { Duplicate: null } | { Plagiarism: null } | { Both: null };

export interface Stats {
  total_documents: bigint;
  memory_used_bytes: bigint;
  max_documents: number;
  max_tokens_per_document: number;
  duplicate_threshold: number;
  check_all_duplicates: boolean;
  fingerprint_size: number;
  fingerprint_threshold: number;
}

export class CanisterService {
  private actor: any;
  private canisterId: string;
  
  constructor(canisterId: string) {
    this.canisterId = canisterId;
  }
  
  async init(agent: HttpAgent): Promise<void> {
    console.log('CanisterService: Initializing with canisterId:', this.canisterId);
    this.actor = Actor.createActor(idlFactory, {
      agent,
      canisterId: this.canisterId,
    });
    console.log('CanisterService: Actor created:', this.actor);
  }
  
  async storeDocument(
    title: string, 
    encryptedTokens: Uint8Array[], 
    publicKeyN: string, 
    publicKeyG: string
  ): Promise<StoreResult> {
    if (!this.actor) {
      throw new Error('Canister not initialized');
    }
    
    return await this.actor.store_document(title, encryptedTokens, publicKeyN, publicKeyG);
  }
  
  async compareDocuments(docId1: string, docId2: string): Promise<CompareResult> {
    if (!this.actor) {
      throw new Error('Canister not initialized');
    }
    
    return await this.actor.compare_documents(docId1, docId2);
  }
  
  async compareWithDocument(
    docId: string,
    encryptedTokens: Uint8Array[],
    mode?: ComparisonMode
  ): Promise<CompareResult> {
    if (!this.actor) {
      throw new Error('Canister not initialized');
    }
    
    return await this.actor.compare_with_document(docId, encryptedTokens, mode ? [mode] : []);
  }
  
  async listMyDocuments(): Promise<string[]> {
    if (!this.actor) {
      throw new Error('Canister not initialized');
    }
    
    return await this.actor.list_my_documents();
  }
  
  async listAllDocuments(): Promise<DocumentMetadata[]> {
    if (!this.actor) {
      throw new Error('Canister not initialized');
    }
    
    console.log('CanisterService: Calling list_all_documents...');
    const result = await this.actor.list_all_documents();
    console.log('CanisterService: list_all_documents result:', result);
    return result;
  }
  
  async getStats(): Promise<Stats> {
    if (!this.actor) {
      throw new Error('Canister not initialized');
    }
    
    return await this.actor.get_stats();
  }
}