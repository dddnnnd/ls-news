# V13 release checks

Static validations executed during packaging:
- `node --check` passed for all inline JavaScript blocks in `index.html`.
- HTML parsing found no duplicate IDs.
- The V12 cabinet polish override and premium media picker are absent; the classic photo upload and site illustration album markup is present.
- The unwanted public `Подать объявление` button/label is absent.
- There are no startup `localStorage.removeItem()` calls for the news/ad/column content keys.
- The previous HTML and V12 HTML are included under `recovery/backups/` for manual rollback.

This package cannot recover client-local ad records that a previous release explicitly erased; no such JSON backup is present in the available files, and the live Supabase table was empty when examined. It restores the known built-in LSN news/columns, adds the known LSN recruitment advertisement, restores the image album/editor, and protects future saves with an export/import feature and one-time cloud migration marker.

Still required after deployment: run admin recovery SQL if the exact account check matches, then test sign-in, role management, media upload, content upsert/delete and feed refresh in a live browser. The editorial-state marker migrations are already applied to production.

Live Supabase check: the editorial marker row exists and is pending (`initialized=false`); the database currently contains three published `column` rows and no `news`/`ad` rows, so the next management session can restore the built-in/available local news and LSN advertisement instead of treating the partial table as complete. The marker migrations 20261025084552 and 20261025084553 are applied. Admin role restoration was not executed via this session; see the manual, account-specific SQL script.
