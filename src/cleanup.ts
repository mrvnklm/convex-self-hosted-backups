import { S3Client, S3ClientConfig, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { env } from "./env.js";

interface BackupFile {
  key: string;
  timestamp: Date;
}

const parseTimestampFromFilename = (filename: string, prefix: string): Date | null => {
  // Expected format: {prefix}-YYYY-MM-DDTHH-MM-SS-SSSZ.zip
  // Example: backup-2024-01-15T10-30-45-123Z.zip
  const pattern = new RegExp(`^${prefix}-(\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z)\\.zip$`);
  const match = filename.match(pattern);

  if (!match) {
    return null;
  }

  // Convert the timestamp back to ISO format for parsing
  const isoTimestamp = match[1].replace(/-/g, (match, offset, string) => {
    // Replace only the dashes that are not in the date part
    // YYYY-MM-DDTHH-MM-SS-SSSZ -> YYYY-MM-DDTHH:MM:SS.SSSZ
    if (offset === 4 || offset === 7) return '-'; // Keep date dashes
    if (offset === 13 || offset === 16) return ':'; // Replace time dashes with colons
    if (offset === 19) return '.'; // Replace millisecond dash with dot
    return match;
  });

  const date = new Date(isoTimestamp);
  return isNaN(date.getTime()) ? null : date;
}

export const cleanupOldBackups = async () => {
  // Check if cleanup is enabled
  if (env.MAX_BACKUP_COUNT === undefined && env.MAX_BACKUP_AGE_DAYS === undefined) {
    console.log("Backup cleanup is disabled (no MAX_BACKUP_COUNT or MAX_BACKUP_AGE_DAYS configured)");
    return;
  }

  console.log("Starting backup cleanup...");

  const bucket = env.AWS_S3_BUCKET;
  const prefix = env.BACKUP_FILE_PREFIX;
  const subfolder = env.BUCKET_SUBFOLDER;

  // Build the prefix to search for
  let searchPrefix = prefix;
  if (subfolder) {
    searchPrefix = `${subfolder}/${prefix}`;
  }

  // Configure S3 client
  const clientOptions: S3ClientConfig = {
    region: env.AWS_S3_REGION,
    forcePathStyle: env.AWS_S3_FORCE_PATH_STYLE
  };

  if (env.AWS_S3_ENDPOINT) {
    clientOptions.endpoint = env.AWS_S3_ENDPOINT;
  }

  const client = new S3Client(clientOptions);

  try {
    // List all backup files
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: searchPrefix,
    });

    const response = await client.send(listCommand);

    if (!response.Contents || response.Contents.length === 0) {
      console.log("No backups found to clean up");
      return;
    }

    // Parse and filter backup files
    const backups: BackupFile[] = [];

    for (const obj of response.Contents) {
      if (!obj.Key) continue;

      // Extract filename from key (remove subfolder if present)
      const filename = obj.Key.split('/').pop();
      if (!filename) continue;

      const timestamp = parseTimestampFromFilename(filename, prefix);
      if (timestamp) {
        backups.push({
          key: obj.Key,
          timestamp: timestamp
        });
      }
    }

    if (backups.length === 0) {
      console.log("No valid backup files found to clean up");
      return;
    }

    // Sort backups by timestamp (newest first)
    backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    console.log(`Found ${backups.length} backup(s)`);

    // Determine which backups to delete
    const backupsToDelete: BackupFile[] = [];
    const now = new Date();
    const maxAgeMs = env.MAX_BACKUP_AGE_DAYS ? env.MAX_BACKUP_AGE_DAYS * 24 * 60 * 60 * 1000 : null;

    for (let i = 0; i < backups.length; i++) {
      const backup = backups[i];
      const age = now.getTime() - backup.timestamp.getTime();

      let shouldDelete = false;
      let reason = "";

      // Check count-based retention
      if (env.MAX_BACKUP_COUNT !== undefined && i >= env.MAX_BACKUP_COUNT) {
        shouldDelete = true;
        reason = `exceeds max count (keeping ${env.MAX_BACKUP_COUNT} backups)`;
      }

      // Check age-based retention
      if (maxAgeMs !== null && age > maxAgeMs) {
        shouldDelete = true;
        reason = reason
          ? `${reason} and exceeds max age (${env.MAX_BACKUP_AGE_DAYS} days)`
          : `exceeds max age (${env.MAX_BACKUP_AGE_DAYS} days)`;
      }

      if (shouldDelete) {
        backupsToDelete.push(backup);
        console.log(`Marking for deletion: ${backup.key} (${reason})`);
      }
    }

    // Delete old backups
    if (backupsToDelete.length === 0) {
      console.log("No backups need to be deleted");
      return;
    }

    console.log(`Deleting ${backupsToDelete.length} old backup(s)...`);

    for (const backup of backupsToDelete) {
      try {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: bucket,
          Key: backup.key,
        });

        await client.send(deleteCommand);
        console.log(`Deleted: ${backup.key}`);
      } catch (error) {
        console.error(`Failed to delete ${backup.key}:`, error);
        // Continue with other deletions even if one fails
      }
    }

    console.log(`Backup cleanup complete. Deleted ${backupsToDelete.length} backup(s), kept ${backups.length - backupsToDelete.length} backup(s)`);

  } catch (error) {
    console.error("Error during backup cleanup:", error);
    // Don't throw - cleanup failures shouldn't stop the backup process
  }
}
