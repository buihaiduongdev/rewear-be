import { ShipmentService } from '@/modules/shipment/shipment.service';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';

describe('ShipmentWorker', () => {
  it('delegates scheduled execution to ShipmentService.run()', async () => {
    const run = jest.fn(async () => {});
    const worker = new ShipmentWorker({
      run,
    } as unknown as ShipmentService);
    await worker.run();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
