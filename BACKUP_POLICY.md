# Database Backup Policy

The production database uses the `daily-sales-tracker` Netlify Blobs store. Backups are isolated in the separate `daily-sales-backups` store so a change to the primary store does not overwrite its recovery copies.

## Mandatory rule

No change may rename, delete, replace, or migrate the store, its keys, or the persisted sales schema unless a complete backup is created successfully before the first write. If backup creation fails, the operation must stop without modifying production data.

## Runtime protection

- Every sales update snapshots the previous shared sales data and audit trail.
- Storage-key and schema migrations snapshot their source before creating the replacement data.
- Snapshots use immutable `backup:<timestamp>:<uuid>` keys.
- `backups:index` keeps the 200 newest backup references; older snapshot blobs are not automatically deleted.
- A failed snapshot returns `backup_failed` and blocks the requested write.

## Change checklist

1. Preserve the `daily-sales-tracker` store and all existing keys.
2. Add a versioned migration instead of replacing storage directly.
3. Call `createBackup` before the migration's first write.
4. Abort the migration when backup creation fails.
5. Validate recovery from one snapshot before deploying destructive changes.
6. Never add automatic deletion of backup blobs without explicit owner approval.

