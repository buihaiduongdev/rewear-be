import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CodBuyerCancellation, CodRestriction } from './cod.entity';
import { CodPolicy } from './cod.policy';

@Module({
  imports: [TypeOrmModule.forFeature([CodBuyerCancellation, CodRestriction])],
  providers: [CodPolicy],
  exports: [CodPolicy],
})
export class CodPolicyModule {}
