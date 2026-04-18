/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Transitional: Scramble dynamically imports cubing from a CDN URL.
// Removed in the same change that installs cubing as an npm dependency.
declare module 'https://cdn.cubing.net/v0/js/cubing/scramble';
