import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FeePolicy, FeePolicyShopAcceptance } from './entities';
import { FeeDisclosureController } from './fee-disclosure.controller';
import { FeeDisclosureService } from './fee-disclosure.service';

@Module({
  imports: [TypeOrmModule.forFeature([FeePolicy, FeePolicyShopAcceptance])],
  controllers: [FeeDisclosureController],
  providers: [FeeDisclosureService],
})
export class FeeDisclosureModule {}
