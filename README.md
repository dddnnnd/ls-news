# Los Santos News — V14 login recovery patch

This release keeps the V13 recovered site and its editorial/photo-picker behavior, and adds a secure password-recovery path. It does not intentionally clear local news, advertisements, columns, staff, photo presets, or role configuration.

## First: regain account access

1. Replace the current deployed `index.html` with this release's `index.html` and hard-refresh the page (Ctrl+F5).
2. Open the LSN login dialog. Enter `Ray Westblock` (or the email tied to the account) in **Логин или Email**, then click **Не помню пароль**.
3. Check the mailbox attached to the account, including Spam/Junk. The UI returns a deliberately generic message so it does not reveal whether an account exists.
4. Open the link in the email on the same site and choose a new password. Use at least 8 characters. Then sign in normally.

The password-reset function has been deployed to the connected Supabase project as `username-password-reset`. It uses the server-only service-role key only inside Supabase Edge Functions, returns no account email, and applies server-side rate limiting. The recovery email redirect must be allowlisted in **Supabase → Authentication → URL Configuration**. For local testing, allow the actual local URL (for example `http://localhost:3000/**`). For GitHub Pages, add your actual published URL; do not paste in a guessed URL. Supabase Auth uses the configured Site URL if a requested redirect is not allowlisted.

If no email arrives after checking Spam, use Supabase Dashboard → Authentication → Users to confirm the account's email and trigger recovery from the dashboard. Do not create a new account to replace the old administrator.

## Deployment

Upload the contents of this directory to the root of the GitHub repository. The GitHub Pages workflow publishes the static site. SQL and function sources are source-controlled but are not public website assets.

The Supabase Edge Function source is in `supabase/functions/`. Function configs are in `supabase/config.toml`. The rate-limit and editorial recovery migrations are under `supabase/migrations/`. Review `supabase/sql/restore_primary_admin.sql` only if the login succeeds but the profile's canonical `role` is still not `admin`; it targets only the previously designated primary account and should not be run unchanged for a different account.

## Security notes

- `index.html` contains only the Supabase publishable key. Never put the service-role/secret key in a website file or GitHub Pages.
- `admin-delete-user` requires a verified JWT and checks the authenticated profile's canonical role.
- Username login, availability checks, and password reset return generic failures to avoid exposing account identifiers.
- The leaked-password check against HaveIBeenPwned remains unavailable on the current Supabase Free plan. Keep strong password requirements and advise users not to reuse passwords.

## Limitations

The latest server log showed the authentication provider rejecting the attempted password as `Invalid login credentials`; this is an authentication failure, not evidence by itself that the database role is missing. Resetting the password addresses that failure. Administrator permissions should be checked separately after sign-in.
