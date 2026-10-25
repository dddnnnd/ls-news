# V12 Repair Check Log

- Preserved the V11 HTML hardening changes (UUID ids, safe image URL and color handling, article content rendered as text).
- Restored read-and-save compatibility for existing v20/v18/v16/v12 localStorage keys; application startup no longer deletes those keys.
- Restored the previous default editorial column content.
- A successful Supabase query is authoritative; empty result remains empty for news, preventing deleted news from being recreated from a stale browser cache. Failed network requests no longer clear the visible cache.
- Added an idempotent SQL migration for durable LSN house-advertisements and editorial columns. No news items are seeded.
- Redesigned only the editorial cabinet's layout, tabs, cards, form controls and responsive behavior; homepage styling and sections are preserved.
- Admin recovery is a manual SQL script for the previously designated primary admin only. It is intentionally not an automatically deployed privilege-escalation path.
- Requires live post-deploy browser smoke test. Exact custom ads that existed only in browser localStorage cannot be reconstructed from a clean checkout if the prior V11 script has already removed those keys; the content migration restores editable, database-backed LSN ads and columns.


## Live database state

The V12 restoration SQL is packaged but was not applied to the live project in this run. Run the content migration once in Supabase SQL Editor. The administrator recovery script is manual and targets the previously recorded Ray Westblock profile only; run `inspect_profile_roles.sql` first if the account name is uncertain.
