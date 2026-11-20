import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FeeDisclosureController } from './fee-disclosure.controller';
import { FeePolicy, FeePolicyShopAcceptance } from './fee-disclosure.entity';
import { FeeDisclosureService } from './fee-disclosure.service';

@Module({
  imports: [TypeOrmModule.forFeature([FeePolicy, FeePolicyShopAcceptance])],
  controllers: [FeeDisclosureController],
  providers: [FeeDisclosureService],
})
export class FeeDisclosureModule {}
