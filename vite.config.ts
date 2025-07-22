import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// Debug: Show all CANISTER environment variables
console.log('\n=== CANISTER Environment Variables ===');
Object.entries(process.env).forEach(([key, value]) => {
  if (key.includes('CANISTER')) {
    console.log(`${key}: ${value}`);
  }
});
console.log('=====================================\n');

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  root: '.',
  publicDir: 'web/public',
  build: {
    outDir: 'web/build',
    assetsDir: 'assets',
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '$lib': '/web/src/lib'
    }
  },
  define: {
    // Make dfx-generated canister IDs available to the app
    // Try multiple possible environment variable names
    'import.meta.env.VITE_CANISTER_ID_PAILLIER_CANISTER': JSON.stringify(
      process.env.CANISTER_ID_PAILLIER_CANISTER || 
      process.env.PAILLIER_CANISTER_CANISTER_ID ||
      process.env.CANISTER_PAILLIER_CANISTER ||
      ''
    ),
    // Pass DFX_NETWORK to detect local vs ic deployment
    'import.meta.env.VITE_DFX_NETWORK': JSON.stringify(
      process.env.DFX_NETWORK || 'local'
    ),
  }
})
