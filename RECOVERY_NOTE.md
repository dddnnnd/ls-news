# Recovery note

The previous V11 frontend explicitly removed old localStorage content keys for news, ads and columns and initialized these stores as empty arrays. Those browser records do not exist in the HTML backup and were absent from the inspected Supabase article table. Exact user-created ad text and uploaded image data therefore cannot be reconstructed from the available source files alone.

This recovery preserves any remaining legacy browser keys, restores defaults known from the previous HTML, provides the original 18-image album and custom photo upload, restores the known LSN recruitment ad, and adds an admin-only JSON content backup/restore feature. If you have a browser profile backup or JSON export from before the incident, keep it and import it from the admin cabinet after restoring the correct role.
