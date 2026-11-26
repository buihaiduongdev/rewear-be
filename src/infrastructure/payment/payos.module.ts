import { Module } from '@nestjs/common';

import {
  PAYOS_CLIENT,
  readPayosSettings,
} from '@/modules/payment/payment.config';

import { PayosClient } from './payos.client';

@Module({
  providers: [
    {
      provide: PAYOS_CLIENT,
      useFactory: () => {
        const settings = readPayosSettings();
        return settings ? new PayosClient(settings) : null;
      },
    },
  ],
  exports: [PAYOS_CLIENT],
})
export class PayosModule {}
