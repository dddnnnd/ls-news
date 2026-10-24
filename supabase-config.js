// Public browser configuration. The publishable key is safe to expose in a static site.
// The service_role key must NEVER be placed here.
export const SUPABASE_URL = 'https://kahtjjlnivxkyynfjtyd.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_14vyU74VQOvHtCl-PiYykA_noeUVLAw';

// Works on GitHub Pages, Netlify, custom domains and localhost without hard-coding a host.
// For a repository site, preserve the repository path (e.g. /Los-Santos-News/).
export const PUBLIC_SITE_URL = new URL('.', document.baseURI).toString();
