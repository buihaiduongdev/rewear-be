import { Injectable } from '@nestjs/common';

import { ShipmentService } from './shipment.service';

@Injectable()
export class ShipmentWorker {
  constructor(private readonly shipmentService: ShipmentService) {}

  async run() {
    await this.shipmentService.run();
  }
}
