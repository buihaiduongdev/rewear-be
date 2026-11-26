import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';

import { ConfigService } from '@/modules/config';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.redis.host,
          port: configService.redis.port,
          password: configService.redis.password,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
