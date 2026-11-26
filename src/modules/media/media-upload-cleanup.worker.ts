import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { DataSource } from 'typeorm';

import { StorageService } from '@/infrastructure/storage';

const DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class MediaUploadCleanupWorker {
  private readonly logger = new Logger(MediaUploadCleanupWorker.name);
  private running = false;

  constructor(
    private readonly db: DataSource,
    private readonly storage: StorageService,
  ) {}

  @Interval(DAY)
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      const claimed = await this.db.transaction(async (manager) => {
        const rows: Array<{
          id: string;
          storageKey: string;
          visibility: 'public' | 'private';
        }> = await manager.query(`
          SELECT id, "storageKey", visibility FROM media
          WHERE "isAttached" = false AND "createdAt" < NOW() - INTERVAL '24 hours'
            AND ("retiredAt" IS NULL OR "retiredAt" < NOW() - INTERVAL '1 hour')
          ORDER BY "createdAt" LIMIT 50 FOR UPDATE SKIP LOCKED
        `);
        if (rows.length) {
          await manager.query(
            'UPDATE media SET "retiredAt" = NOW() WHERE id = ANY($1::uuid[])',
            [rows.map((row) => row.id)],
          );
        }
        return rows;
      });
      for (const media of claimed) {
        try {
          await this.storage.delete(media.storageKey, media.visibility);
          await this.db.query(
            'DELETE FROM media WHERE id = $1 AND "isAttached" = false',
            [media.id],
          );
        } catch {
          this.logger.warn(
            'Could not remove an abandoned media upload; will retry later',
          );
        }
      }
    } catch {
      this.logger.error('Media upload cleanup failed; will retry later');
    } finally {
      this.running = false;
    }
  }
}
