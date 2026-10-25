# Los Santos News — V12

Production-oriented static frontend for Los Santos News with Supabase Auth, role-based authorization, editorial storage, and server-side username login.

## Project contents

- `index.html` — website frontend, ready for GitHub Pages or any static host.
- `supabase/config.toml` — Supabase CLI configuration for project `kahtjjlnivxkyynfjtyd` and the three Edge Functions.
- `supabase/functions/admin-delete-user/index.ts` — admin-only account deletion. It refuses self-deletion and deletion of another administrator.
- `supabase/functions/username-login/index.ts` — username login without returning account email; includes server-side rate limits.
- `supabase/functions/username-available/index.ts` — server-side username availability check; includes rate limits.
- `supabase/migrations/20261025002211_add_server_side_edge_function_rate_limits.sql` — migration for the hashed-key rate-limit table and atomic rate-limit RPC.
- `supabase/migrations/20261025011000_restore_lsn_advertising_and_columns.sql` — idempotently restores the LSN advertisement and editorial-column content without reseeding news.
- `supabase/migrations/20261025011000_restore_lsn_advertising_and_columns.sql` — idempotently restores the LSN advertisement and editorial-column content without reseeding news.
- `supabase/migrations/20261025011000_restore_lsn_advertising_and_columns.sql` — idempotently restores the LSN advertisement and editorial-column content without reseeding news.
- `supabase/sql/current_security_reconciliation.sql` — final SQL reconciliation for the **existing LSN database schema**.
- `supabase/sql/restore_primary_admin.sql` — manual recovery for the previously designated Ray Westblock admin only; run only if this is the correct account.
- `supabase/sql/restore_primary_admin.sql` — manual recovery for the previously designated Ray Westblock admin only; run only if this is the correct account.
- `supabase/sql/restore_primary_admin.sql` — manual recovery for the previously designated Ray Westblock admin only; run only if this is the correct account.
- `supabase/tests/security_invariants.sql` — read-only checks of critical security invariants.
- `SECURITY.md` — security notes and release checklist.

## Current production status

The existing Supabase project already has the V11 security policies and Edge Functions. The V12 website preserves old local-cache keys instead of deleting them and modernizes the editorial cabinet. A successful empty cloud query remains authoritative for news, so deleted news is not resurrected from a stale browser cache. The V12 content-restoration migration has **not** been applied to the live database in this run; run it once in Supabase SQL Editor to restore database-backed house ads and columns. This repair preserves legacy local caches rather than deleting them and modernizes the editorial cabinet. A successful empty cloud query remains authoritative for news, so deleted news does not get resurrected from stale local caches. This repair preserves legacy local caches rather than deleting them and modernizes the editorial cabinet. A successful empty cloud query remains authoritative for news, so deleted news does not get resurrected from stale local caches. Before putting the site into public use, complete the smoke test below on the actual hosting domain and confirm sign-in, signup, publishing, image uploads, and account deletion with test accounts.

The Supabase Security Advisor's remaining finding is leaked-password protection. Supabase Free does not offer the HaveIBeenPwned password check; this release does not bypass that product restriction.

## Deploy the website to GitHub Pages

1. Extract this ZIP and upload the **contents** of this directory to the root of your GitHub repository. `index.html` must be in the repository root.
2. In GitHub, open **Settings → Pages** and select **GitHub Actions** as the source. The included `.github/workflows/pages.yml` publishes only `index.html`; SQL and Edge Function sources stay in the repository, not in the deployed Pages artifact.
3. Push to the `main` branch or run the workflow manually from **Actions**.
4. Open the generated Pages URL and use a hard refresh (`Ctrl+F5`) after deployment.
5. Do not add service-role keys, database passwords, access tokens, or `.env` files to the repository.

The publishable Supabase key embedded in the browser frontend is intentionally public. Authorization is enforced by database grants, RLS policies, triggers, and Edge Functions; never put a Supabase secret/service-role key into `index.html`.

## Deploy the Edge Functions from this repo

The three functions are already active in the referenced production project. If you later change their source and want to redeploy, install the Supabase CLI and authenticate locally, then run:

```bash
supabase link --project-ref kahtjjlnivxkyynfjtyd
supabase functions deploy admin-delete-user
supabase functions deploy username-login --no-verify-jwt
supabase functions deploy username-available --no-verify-jwt
```

`username-login` and `username-available` intentionally use `--no-verify-jwt` because they are called before sign-in. Their request validation, server-side rate limiter, and internal database access are implemented inside the functions. `admin-delete-user` requires a valid JWT and independently verifies that the caller is an administrator.

Supabase's hosted Edge Function runtime supplies the project environment variables. The functions require the public/anonymous key and service-role key **server-side only**. Never paste the service-role key into source files or GitHub Actions logs.

## SQL files: read before applying

The production database already has a history of migrations. The `supabase/migrations` directory contains the rate-limiter and advertising/content restoration migrations added for this release; it is not a complete reconstruction of every historical migration that created the site's base schema. Do **not** assume this repository is a blank-project bootstrap or blindly run `supabase db push` against the existing production project without reconciling migration history.

`supabase/sql/current_security_reconciliation.sql` is a consolidation/reconciliation script for the existing LSN schema. It expects the existing tables, triggers, `article-images` bucket, and prior base schema. Keep a database backup before applying it. The active production project has already received the V11 security baseline. Apply the V12 content migration separately as described above; it is deliberately not run by the GitHub Pages workflow.

To restore the editorial advertisements and columns in the existing project, apply `supabase/migrations/20261025011000_restore_lsn_advertising_and_columns.sql` once. It adds a small set of LSN house-advertisements and restored columns; it does not reinsert news rows. If the site account lost its admin role, open `supabase/sql/restore_primary_admin.sql` in Supabase SQL Editor only after confirming Ray Westblock is the account you use. To run the read-only invariant checks, open `supabase/tests/security_invariants.sql` and execute it. It raises an exception if a critical privilege, role hierarchy, or RLS invariant is missing.

## Post-deploy smoke test

- Refresh the public feed; delete one test article in the editor and refresh again. A deleted row must stay gone.
- Sign in with a username/password and test incorrect credentials; the endpoint must not reveal whether the username exists.
- Verify `user` cannot create articles or upload article images.
- Verify `journalist` can create their own draft, but cannot publish, delete, edit a published article, or modify another person's draft.
- Verify `director` can manage lower-ranked roles but cannot assign an equal or higher role.
- Verify `admin` cannot change their own role, cannot appoint another admin through the profile editor, and cannot delete their own account or another admin account.
- Test article create/edit/delete and image upload with permitted roles.

## Release note

The code has passed static JavaScript syntax checks and targeted SQL authorization tests in the existing Supabase project. A complete end-to-end browser test against the public hosting URL still needs to be performed after GitHub Pages finishes publishing; therefore this release should be described as **security-hardened and ready for deployment/testing**, not as a mathematically guaranteed zero-defect system.
