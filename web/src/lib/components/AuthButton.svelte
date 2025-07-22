<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { AuthService } from '../api/auth';
  
  const dispatch = createEventDispatcher();
  
  let authService: AuthService;
  let isAuthenticated = false;
  let principal: string | null = null;
  let isLoading = false;
  
  onMount(async () => {
    authService = new AuthService();
    await authService.init();
    await checkAuth();
  });
  
  async function checkAuth() {
    isAuthenticated = await authService.isAuthenticated();
    if (isAuthenticated) {
      principal = await authService.getPrincipal();
      console.log('AuthButton: Dispatching authenticated event');
      dispatch('authenticated', { principal });
    }
  }
  
  async function handleLogin() {
    isLoading = true;
    try {
      await authService.login();
      await checkAuth();
    } catch (error) {
      console.error('Login failed:', error);
      dispatch('error', { message: 'Login failed' });
    } finally {
      isLoading = false;
    }
  }
  
  async function handleLogout() {
    isLoading = true;
    try {
      await authService.logout();
      isAuthenticated = false;
      principal = null;
      dispatch('logout');
    } catch (error) {
      console.error('Logout failed:', error);
      dispatch('error', { message: 'Logout failed' });
    } finally {
      isLoading = false;
    }
  }
  
  export function getAuthService(): AuthService {
    return authService;
  }
  
  export function getAgent() {
    return authService?.getAgent() || null;
  }
</script>

<div class="auth-container">
  {#if isAuthenticated}
    <div class="auth-info">
      <span class="principal" title={principal}>
        <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
        {principal && typeof principal === 'string' ? principal.slice(0, 8) + '...' + principal.slice(-3) : 'Connected'}
      </span>
      <button 
        class="btn-logout"
        on:click={handleLogout}
        disabled={isLoading}
      >
        {isLoading ? 'Logging out...' : 'Logout'}
      </button>
    </div>
  {:else}
    <button 
      class="btn-login"
      on:click={handleLogin}
      disabled={isLoading}
    >
      {#if isLoading}
        <span class="spinner"></span>
        Connecting...
      {:else}
        <svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
          <polyline points="10 17 15 12 10 7"></polyline>
          <line x1="15" y1="12" x2="3" y2="12"></line>
        </svg>
        Login with Internet Identity
      {/if}
    </button>
  {/if}
</div>

<style>
  .auth-container {
    @apply flex items-center gap-4;
  }
  
  .auth-info {
    @apply flex items-center gap-3;
  }
  
  .principal {
    @apply flex items-center gap-2 text-sm text-gray-600 font-mono;
  }
  
  .icon {
    @apply text-gray-500;
  }
  
  .btn-login {
    @apply flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg;
    @apply hover:bg-gray-700 transition-colors;
    @apply focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2;
    @apply disabled:opacity-50 disabled:cursor-not-allowed;
  }
  
  .btn-logout {
    @apply px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded;
    @apply hover:bg-gray-300 transition-colors;
    @apply focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2;
    @apply disabled:opacity-50 disabled:cursor-not-allowed;
  }
  
  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>