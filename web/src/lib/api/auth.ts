import { AuthClient } from '@dfinity/auth-client';
import { HttpAgent, Actor } from '@dfinity/agent';

// Always use mainnet Internet Identity for simplicity
const INTERNET_IDENTITY_URL = 'https://identity.ic0.app';

export class AuthService {
  private authClient: AuthClient | null = null;
  private agent: HttpAgent | null = null;
  
  async init(): Promise<void> {
    this.authClient = await AuthClient.create();
    
    // Check if already authenticated
    const isAuthenticated = await this.authClient.isAuthenticated();
    if (isAuthenticated) {
      await this.setupAgent();
    }
  }
  
  async login(): Promise<void> {
    if (!this.authClient) {
      throw new Error('Auth client not initialized');
    }
    
    await new Promise<void>((resolve, reject) => {
      this.authClient!.login({
        identityProvider: INTERNET_IDENTITY_URL,
        onSuccess: () => {
          this.setupAgent().then(() => resolve());
        },
        onError: (error) => {
          reject(error);
        },
        windowOpenerFeatures: 
          `toolbar=0,location=0,menubar=0,width=500,height=500,left=${window.innerWidth / 2 - 250},top=${window.innerHeight / 2 - 250}`,
      });
    });
  }
  
  async logout(): Promise<void> {
    if (!this.authClient) {
      throw new Error('Auth client not initialized');
    }
    
    await this.authClient.logout();
    this.agent = null;
  }
  
  async isAuthenticated(): Promise<boolean> {
    if (!this.authClient) {
      return false;
    }
    
    return this.authClient.isAuthenticated();
  }
  
  async getPrincipal(): Promise<string | null> {
    if (!this.authClient) {
      return null;
    }
    
    const identity = this.authClient.getIdentity();
    return identity.getPrincipal().toString();
  }
  
  getAgent(): HttpAgent | null {
    return this.agent;
  }
  
  private async setupAgent(): Promise<void> {
    if (!this.authClient) {
      throw new Error('Auth client not initialized');
    }
    
    const identity = this.authClient.getIdentity();
    
    // Use DFX_NETWORK to determine if we're in local or IC environment
    const isLocal = import.meta.env.VITE_DFX_NETWORK !== 'ic';
    
    this.agent = new HttpAgent({
      identity,
      host: isLocal ? 'http://localhost:4943' : 'https://ic0.app',
    });
    
    // Fetch root key for local development
    if (isLocal) {
      await this.agent.fetchRootKey();
    }
  }
}