import { Module } from '@nestjs/common';

import { AdministrativeDivisionController } from './administrative-division.controller';
import { AdministrativeDivisionService } from './administrative-division.service';

@Module({
  controllers: [AdministrativeDivisionController],
  providers: [AdministrativeDivisionService],
  exports: [AdministrativeDivisionService],
})
export class AdministrativeDivisionModule {}
