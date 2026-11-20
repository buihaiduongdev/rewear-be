import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  FeeAssessment,
  FeeCollection,
  FeeDecision,
  FeeNotice,
  FeeRefund,
} from './entities/fee.entity';
import { FeeController } from './fee.controller';
import { FeeService } from './fee.service';
import { FeeWorker } from './fee.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FeeAssessment,
      FeeCollection,
      FeeDecision,
      FeeNotice,
      FeeRefund,
    ]),
  ],
  controllers: [FeeController],
  providers: [FeeService, FeeWorker],
  exports: [FeeService],
})
export class FeeModule {}
