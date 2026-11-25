import { Injectable } from '@nestjs/common';

import { OrderSettlementService } from './order-settlement.service';

@Injectable()
export class OrderSettlementWorker {
  constructor(private readonly settlement: OrderSettlementService) {}

  async run() {
    await this.settlement.settleDue();
  }
}
