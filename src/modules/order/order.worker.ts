import { Injectable } from '@nestjs/common';

import { OrderService } from './order.service';

@Injectable()
export class OrderWorker {
  constructor(private readonly orderService: OrderService) {}

  async run() {
    return this.orderService.expireDue();
  }
}
