# Security notes — LSN Recovery V13

- Authorization is enforced by Supabase grants, RLS, database triggers and Edge Functions, not by client-side buttons alone.
- The five supported profile roles are `admin`, `director`, `deputy`, `journalist`, `user` with ranks 5 through 1.
- `service_role` credentials are used only inside server-side Edge Functions and must not be added to static files or GitHub Secrets for the Pages-only workflow.
- Public username-login and username-availability endpoints use server-side request limits through `lsn_consume_edge_rate_limit`. The rate limiter key stores only SHA-256 hashes of the scope/address/identity tuple.
- Account deletion is restricted to admins; self-deletion and deletion of any admin account are refused.
- `profiles` cannot be deleted directly by `authenticated`; deletion should flow through the guarded Auth admin function.
- Legacy tables remain in place to preserve recoverable records; client grants are removed and deny-all RLS policies are used.
- The public login lookup RPCs `lsn_login_email_by_username` and `lsn_username_available` are revoked; login/availability checks live in server-side Edge Functions.
- User-supplied content is rendered as text. Images are restricted to passive raster data URLs, validated SVG album art, or HTTP(S) URLs.
- The application no longer removes legacy content keys during startup. It reads old cache versions and offers admin backup export/import.
- `lsn_editorial_state` is a server marker to distinguish a truly initialized cloud feed from an empty database during first recovery. Execute its migration once before using cross-device editorial recovery.
- Leaked password detection via HaveIBeenPwned is unavailable on the current Supabase Free plan. Choose strong unique passwords; enable that check if the project plan later supports it.

No static or database checks can guarantee absence of all runtime faults. Complete the live-browser smoke test after deploy.
