import { Injectable } from '@nestjs/common';

import { ShopPayoutService } from './shop-payout.service';

@Injectable()
export class ShopPayoutWorker {
  constructor(private readonly service: ShopPayoutService) {}

  async run() {
    await this.service.run();
  }
}
