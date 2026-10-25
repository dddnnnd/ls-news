# Security notes — LSN Recovery V14

- Authorization is enforced by Supabase grants, RLS, database triggers and Edge Functions, not client-side buttons alone.
- Supported profile roles are `admin`, `director`, `deputy`, `journalist`, `user`, ranks 5 through 1.
- The service-role key is read only from the server-side Edge Function environment and must never be placed in `index.html`, repository files, or browser code.
- Username login, username availability, and password recovery use server-side request limits. Rate-limit keys are SHA-256 hashes of the scope/address/identity tuple, not raw email addresses.
- The password-recovery endpoint returns a generic response to avoid account enumeration, does not expose the email address, and sends the recovery link through Supabase Auth.
- `admin-delete-user` requires a verified JWT, checks the actor's canonical role, prohibits self-deletion, and refuses deletion of admin accounts.
- Direct client profile deletion is revoked. Role changes are guarded in the profile trigger and RLS policies.
- Legacy tables remain in place to preserve potentially recoverable records; client grants are removed and deny-all RLS policies are used.
- The public username-to-email lookup RPC is revoked; lookup happens server-side in Edge Functions.
- The app preserves old content keys and does not clear the browser's news/ad/column stores at startup. It uses a server initialization marker during editorial recovery.
- Leaked-password detection using HaveIBeenPwned is unavailable on the current Supabase Free plan. Use a unique strong password; enable the check when the project plan supports it.

No static or database checks can guarantee absence of all runtime faults. Complete the live login, password recovery, roles, editorial content and photo-upload smoke tests after deployment.
