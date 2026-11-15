import { CarrierIncidentService } from '@/modules/shipment/carrier-incident.service';
import { LateHandoverService } from '@/modules/shipment/late-handover.service';
import { ReturnInspectionDeadlineService } from '@/modules/shipment/return-inspection-deadline.service';
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
      {
        run: async () => {
          steps.push('handover');
        },
      } as unknown as LateHandoverService,
      {
        run: async () => {
          steps.push('incident');
        },
      } as unknown as CarrierIncidentService,
      {
        run: async () => {
          steps.push('inspection');
        },
      } as unknown as ReturnInspectionDeadlineService,
    );
    await expect(worker.run()).rejects.toBeInstanceOf(Error);
    expect(steps).toEqual([
      'cancellation',
      'shipment',
      'handover',
      'incident',
      'inspection',
    ]);
  });
});
