# Data Safety

- Follow `BACKUP_POLICY.md` for every persistence or project-structure change.
- Never rename, delete, or replace the Netlify Blobs store or persisted keys without a successful pre-change backup and a versioned migration.
- Any operation that can overwrite or remove production sales data must fail closed when backup creation fails.
- Do not delete backup blobs without explicit owner approval.

