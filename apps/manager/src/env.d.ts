/** API address the Vite proxy forwards /api to (set in vite.config.ts; shown in messages). */
declare const __API_PROXY_TARGET__: string;

interface ImportMetaEnv {
  /** Optional: call an API on another origin directly instead of through the /api proxy. */
  readonly VITE_MANAGER_API_URL?: string;
  readonly VITE_EDITOR_TOKEN?: string;
}
