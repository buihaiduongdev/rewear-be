import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CodBuyerCancellation, CodRestriction } from './entities';
import { CodPolicy } from './policies/cod.policy';

@Module({
  imports: [TypeOrmModule.forFeature([CodBuyerCancellation, CodRestriction])],
  providers: [CodPolicy],
  exports: [CodPolicy],
})
export class CodPolicyModule {}
