# V11 release verification

Checked against the existing Supabase project on 25 October 2026.

## Passed

- All inline JavaScript blocks pass `node --check`.
- All three Edge Function TypeScript sources pass TypeScript syntax transpilation.
- HTML parser completed; 5 forms, 77 buttons, 36 inputs; no duplicate literal element IDs.
- No service-role key, Supabase secret key, or database connection string is embedded in `index.html`.
- Database role ranks match the required five-role hierarchy.
- `profiles`, `lsn_articles`, `lsn_site_banners`, `lsn_radio_ratings`, and `storage.objects` have RLS enabled.
- Clients cannot directly delete profiles or read/write the private rate-limit table.
- Legacy username-to-email and username-availability RPCs are not executable by `anon` or `authenticated`.
- Tested transactions confirm: no self-role change; no equal-rank role assignment; journalist cannot publish or delete articles; deleted/test rows are rolled back.
- Rate-limit test confirms the second request exceeds a one-request test window and is rejected.
- Production Edge Functions are active: `admin-delete-user` v1, `username-login` v2, `username-available` v2.
- Supabase Security Advisor reports only the leaked-password-protection warning on the current Free plan.

## Not claimed

A browser-driven end-to-end run against the final public GitHub Pages URL has not been completed in this environment. The first production smoke test after Pages deployment must verify sign-in, signup, feed refresh after delete, article publishing, and Storage uploads with test accounts.

A static check cannot mathematically guarantee that software has no defects. Keep backups and review future schema changes before applying them.
