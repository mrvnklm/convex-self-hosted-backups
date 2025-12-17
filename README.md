
# Convex Backups
Backup script for backing up self hosted convex instances, 
includes file storage and whole database backup via `npx convex export` and uploads it to s3 supported storage
backups are importable to cloud or any selfhosted instance via `npx convex import`.


## ENV VARS

- `CONVEX_SELF_HOSTED_ADMIN_KEY` - Your self hosted instance's admin key.

- `CONVEX_SELF_HOSTED_URL` - Your self hosted instance's url (api).

- `CONVEX_URL` - Your selfhosted instance's url (api).

- `AWS_ACCESS_KEY_ID` - AWS access key ID.

- `AWS_SECRET_ACCESS_KEY` - AWS secret access key, sometimes also called an application key.

- `AWS_S3_BUCKET` - The name of the bucket that the access key ID and secret access key are authorized to access.

- `AWS_S3_REGION` - The name of the region your bucket is located in, set to `auto` if unknown.

- `BACKUP_CRON_SCHEDULE` - The cron schedule to run the backup on. Example: `0 5 * * *`

- `AWS_S3_ENDPOINT` - The S3 custom endpoint you want to use. Applicable for 3-rd party S3 services such as Cloudflare R2 or Backblaze R2.

- `AWS_S3_FORCE_PATH_STYLE` - Use path style for the endpoint instead of the default subdomain style, useful for MinIO. Default `false`

- `RUN_ON_STARTUP` - Run a backup on startup of this application then proceed with making backups on the set schedule.

- `BACKUP_FILE_PREFIX` - Add a prefix to the file name.

- `BUCKET_SUBFOLDER` - Define a subfolder to place the backup files in.

- `SINGLE_SHOT_MODE` - Run a single backup on start and exit when completed. Useful with the platform's native CRON schedular.

- `SUPPORT_OBJECT_LOCK` - Enables support for buckets with object lock by providing an MD5 hash with the backup file.

- `MAX_BACKUP_COUNT` - Maximum number of backups to keep. Older backups will be automatically deleted after each backup. Leave unset to disable count-based cleanup.

- `MAX_BACKUP_AGE_DAYS` - Maximum age of backups in days. Backups older than this will be automatically deleted after each backup. Leave unset to disable age-based cleanup.

## Backup Retention & Cleanup

The backup script supports automatic cleanup of old backups based on retention policies. Cleanup runs automatically after each successful backup.

### Retention Policies

You can configure two types of retention policies (both optional and can be used together):

1. **Count-based retention** (`MAX_BACKUP_COUNT`): Keep only the N most recent backups
2. **Age-based retention** (`MAX_BACKUP_AGE_DAYS`): Delete backups older than N days

If both policies are configured, a backup will be deleted if it meets **either** condition (exceeds max count OR exceeds max age).

### Examples

**Keep last 30 backups:**
```bash
MAX_BACKUP_COUNT=30
```

**Delete backups older than 90 days:**
```bash
MAX_BACKUP_AGE_DAYS=90
```

**Combined policy (keep last 30 backups AND delete anything older than 90 days):**
```bash
MAX_BACKUP_COUNT=30
MAX_BACKUP_AGE_DAYS=90
```

**No automatic cleanup (default):**
```bash
# Leave both variables unset
```

### Notes

- Cleanup is **disabled by default** - you must explicitly set at least one retention policy to enable it
- Cleanup is **subfolder-aware** - it only affects backups in the same `BUCKET_SUBFOLDER` with matching `BACKUP_FILE_PREFIX`
- Cleanup runs **after each successful backup** to ensure storage limits are maintained
- Failed cleanups are logged but do not stop the backup process
