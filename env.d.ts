/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_INTEGRATION?: string;
  readonly VITE_SUPABASE_MEMBER_INTEGRATION?: string;
  readonly VITE_SUPABASE_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
