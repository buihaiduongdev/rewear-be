import { ShipmentCancellationService } from '@/modules/shipment/shipment-cancellation.service';
import { ShipmentService } from '@/modules/shipment/shipment.service';
import { ShipmentWorker } from '@/modules/shipment/shipment.worker';

describe('fulfillment worker failure isolation', () => {
  it('still reconciles carrier shipments when processing cancellation deadlines fails', async () => {
    const steps: string[] = [];
    const cancellations = {
      run: async () => {
        steps.push('cancellation');
        throw new Error('database unavailable');
      },
    };
    const shipments = {
      run: async () => {
        steps.push('shipment');
      },
    };
    const worker = new ShipmentWorker(
      shipments as unknown as ShipmentService,
      cancellations as unknown as ShipmentCancellationService,
    );
    await expect(worker.run()).rejects.toBeInstanceOf(Error);
    expect(steps).toEqual(['cancellation', 'shipment']);
  });
});
