# Login diagnosis and fix

The last sign-in attempt appeared in Supabase Auth logs as `400: Invalid login credentials`, and the `username-login` Edge Function returned 401. The username-login endpoint was reached successfully; Auth rejected the provided credential pair. This does not demonstrate an RLS role error.

V14 adds `Не помню пароль` to the login dialog and a recovery-completion form for the `PASSWORD_RECOVERY` event. `username-password-reset` is deployed to the connected Supabase project and sends recovery email through Supabase Auth, without exposing account email or revealing whether an account exists. Password reset depends on access to the registered mailbox and correctly configured Supabase Site URL / Redirect URLs.
