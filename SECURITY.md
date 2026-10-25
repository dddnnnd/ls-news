# Security notes — Los Santos News

## Trust boundaries

- Browser code is public. The Supabase publishable/anonymous key is not a secret.
- Supabase service-role credentials belong only in the hosted Edge Function environment and must never appear in HTML, JavaScript, Git history, issue screenshots, or client logs.
- Database grants and RLS policies are both used. Critical profile and article operations are additionally enforced in PostgreSQL triggers.
- Username-to-email resolution is performed server-side by `username-login`. The old public RPCs `lsn_login_email_by_username` and `lsn_username_available` have client execution revoked.
- Username login and availability checks have a server-side atomic rate limiter. If the rate-limit service is unavailable, those endpoints fail closed rather than skipping the limit.
- `admin-delete-user` validates the caller's JWT and role in the database. It refuses self-deletion and deletion of any account with the `admin` role.

## Five-role policy

| Role | Rank | Expected access |
|---|---:|---|
| `admin` | 5 | Manages staff and editorial data; account deletion is server-side and cannot target self or another admin. Cannot self-promote/change own role. |
| `director` | 4 | Manages lower-ranked staff and editorial operations; cannot assign an equal/higher role. |
| `deputy` | 3 | Manages journalists/users and editorial operations; cannot assign an equal/higher role. |
| `journalist` | 2 | Creates own draft news and uploads own article images; cannot publish, delete, or modify published material. |
| `user` | 1 | Read-only for editorial data; cannot write articles or upload article images. |

## Current limitation

Leaked-password checking against HaveIBeenPwned is unavailable on the current Supabase Free plan. This limitation is not bypassed by client code. Use strong unique passwords and upgrade the Supabase plan if that control is required.

## Release verification

Run `supabase/tests/security_invariants.sql` in the existing database. After deployment, also complete the end-to-end smoke test in `README.md`. No automated static test can prove that a web app is completely free of defects or that every production integration works under all conditions.
