import { AuthClient } from '@dfinity/auth-client';
import { HttpAgent, Actor } from '@dfinity/agent';

// Use local or mainnet Internet Identity based on DFX_NETWORK
const isLocal = import.meta.env.VITE_DFX_NETWORK !== 'ic';
const INTERNET_IDENTITY_URL = isLocal 
  ? `http://localhost:4943/?canisterId=${import.meta.env.VITE_INTERNET_IDENTITY_CANISTER_ID}`
  : 'https://identity.ic0.app';

export class AuthService {
  private authClient: AuthClient | null = null;
  private agent: HttpAgent | null = null;
  
  async init(): Promise<void> {
    this.authClient = await AuthClient.create();
    console.log('AuthService: init - authClient created');
    
    // Check if already authenticated
    const isAuthenticated = await this.authClient.isAuthenticated();
    console.log('AuthService: init - isAuthenticated:', isAuthenticated);
    if (isAuthenticated || (isLocal && localStorage.getItem('mock_auth') === 'true')) {
      console.log('AuthService: init - setting up agent');
      await this.setupAgent();
    }
  }
  
  async login(): Promise<void> {
    if (!this.authClient) {
      throw new Error('Auth client not initialized');
    }
    
    // For local development, use mock authentication
    // SECURITY: Only allow mock auth when explicitly in local development
    if (isLocal && import.meta.env.VITE_DFX_NETWORK === 'local' && !import.meta.env.VITE_INTERNET_IDENTITY_CANISTER_ID) {
      await this.mockLogin();
      return;
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
  
  private async mockLogin(): Promise<void> {
    console.log('AuthService: mockLogin started');
    
    // The authClient is already created in init()
    if (!this.authClient) {
      throw new Error('Auth client not initialized');
    }
    
    // Setup the agent with the current identity
    await this.setupAgent();
    
    // Store a flag to indicate mock auth
    localStorage.setItem('mock_auth', 'true');
    
    console.log('Mock authentication successful for local development');
  }
  
  async logout(): Promise<void> {
    if (!this.authClient) {
      throw new Error('Auth client not initialized');
    }
    
    await this.authClient.logout();
    this.agent = null;
    
    // Clear mock auth flag
    localStorage.removeItem('mock_auth');
  }
  
  async isAuthenticated(): Promise<boolean> {
    if (!this.authClient) {
      return false;
    }
    
    // Check for mock auth in local development
    const hasMockAuth = isLocal && import.meta.env.VITE_DFX_NETWORK === 'local' && localStorage.getItem('mock_auth') === 'true';
    console.log('AuthService: isAuthenticated - hasMockAuth:', hasMockAuth);
    if (hasMockAuth) {
      return true;
    }
    
    return this.authClient.isAuthenticated();
  }
  
  async getPrincipal(): Promise<string | null> {
    if (!this.authClient) {
      return null;
    }
    
    // Return a mock principal for local development
    if (isLocal && import.meta.env.VITE_DFX_NETWORK === 'local' && localStorage.getItem('mock_auth') === 'true') {
      return '2vxsx-fae'; // Anonymous principal for local testing
    }
    
    const identity = this.authClient.getIdentity();
    return identity.getPrincipal().toString();
  }
  
  getAgent(): HttpAgent | null {
    console.log('AuthService: getAgent called, returning:', this.agent);
    return this.agent;
  }
  
  private async setupAgent(): Promise<void> {
    if (!this.authClient) {
      throw new Error('Auth client not initialized');
    }
    
    const identity = this.authClient.getIdentity();
    console.log('AuthService: setupAgent - identity:', identity);
    
    // Use DFX_NETWORK to determine if we're in local or IC environment
    const isLocal = import.meta.env.VITE_DFX_NETWORK !== 'ic';
    const host = isLocal ? 'http://localhost:4943' : 'https://ic0.app';
    console.log('AuthService: setupAgent - isLocal:', isLocal, 'host:', host);
    
    this.agent = new HttpAgent({
      identity,
      host,
    });
    
    console.log('AuthService: setupAgent - agent created:', this.agent);
    
    // Fetch root key for local development
    if (isLocal) {
      await this.agent.fetchRootKey();
      console.log('AuthService: setupAgent - fetchRootKey completed');
    }
  }
}