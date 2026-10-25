# V14 login recovery validation

Checks performed for this package:
- Both inline JavaScript blocks in `index.html` pass `node --check`.
- The four Edge Function TypeScript sources pass a parser-level syntax check.
- Password reset UI controls are present, the recovery callback handles `PASSWORD_RECOVERY`, and the frontend passes its current origin as a redirect candidate.
- Static frontend checked for secret/service-role key patterns; none found.
- Recovery SQL and Edge Function source are included in the package. The live `username-password-reset` Edge Function is deployed as version 2 with JWT verification disabled by design because the caller is signed out; its output does not reveal an email or account existence and it uses rate limiting.

Diagnosis from the latest live attempt:
- Supabase Auth recorded `Invalid login credentials` and the `username-login` endpoint returned HTTP 401. This indicates rejected username/password credentials rather than an RLS denial.
- The recovery email has not been sent directly from this build environment. After deploying this `index.html`, click **Не помню пароль**, enter the account's username or email, then check the registered mailbox and Spam.
- Supabase Auth must allow the current page URL in Authentication → URL Configuration. If the requested redirect is not allowlisted, Supabase uses the configured Site URL.

Still requires the user-side flow after deploying:
1. Request password recovery and open the email link on the same website.
2. Set a new password and sign in.
3. Check canonical role `profiles.role` separately. If the account signs in but has no admin permissions, run `supabase/sql/inspect_profile_roles.sql` in the Supabase SQL Editor and only then, if the account ID/name match the intended primary admin, use `supabase/sql/restore_primary_admin.sql`.
4. After sign-in, test admin cabinet sections, new/edit/delete article, ad/column content, image picker/upload, and refresh feed.

The unavailable HaveIBeenPwned leaked-password check remains the known Free-plan limitation. The release does not claim that a live password reset or role restoration has completed until the user completes and verifies those steps.
