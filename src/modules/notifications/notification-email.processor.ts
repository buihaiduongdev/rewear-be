import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';

import type { Job } from 'bullmq';
import { DataSource } from 'typeorm';

import { QUEUE_NAMES } from '@/infrastructure/queue/queue.constants';
import { MailService } from '@/modules/mail/mail.service';
import { User } from '@/modules/user/entities';
import { UserStatus } from '@/modules/user/enums';

export type TEmailNotificationJobData = {
  notificationId: string;
  recipientId: string;
  title: string;
  body: string;
};

@Injectable()
@Processor(QUEUE_NAMES.EMAIL_NOTIFICATIONS)
export class NotificationEmailProcessor extends WorkerHost {
  constructor(
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
  ) {
    super();
  }

  async process(job: Job<TEmailNotificationJobData>): Promise<void> {
    await this.handleEmail(job.data);
  }

  async handleEmail(data: TEmailNotificationJobData): Promise<void> {
    const user = await this.dataSource.manager.findOneBy(User, {
      id: data.recipientId,
      status: UserStatus.ACTIVE,
    });
    if (!user) return;

    await this.mailService.sendNotificationEmail(
      user.email,
      { title: data.title, body: data.body },
      data.notificationId,
    );
  }
}
