import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { RETURN_BOOKING_POLICY } from './constants/return-booking.constant';
import { ReturnBookingService } from './return-booking.service';

@Injectable()
export class ReturnBookingWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(ReturnBookingWorker.name);
  constructor(private readonly bookings: ReturnBookingService) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.bookings
        .poll()
        .catch(() =>
          this.logger.error('Return carrier scan failed; retry required'),
        )
        .finally(() => {
          this.running = false;
        });
    }, RETURN_BOOKING_POLICY.POLL_INTERVAL_MS);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
