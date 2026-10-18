import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Serialize } from '@/common/decorators';

import { AdministrativeDivisionService } from './administrative-division.service';
import type { AdministrativeProvince, AdministrativeWard } from './data';
import {
  administrativeProvinceListSchema,
  administrativeWardListSchema,
} from './schemas';

@ApiTags('Administrative divisions')
@Controller('administrative-divisions')
export class AdministrativeDivisionController {
  constructor(
    private readonly administrativeDivisionService: AdministrativeDivisionService,
  ) {}

  @Get('provinces')
  @Serialize(administrativeProvinceListSchema)
  findAllProvinces(): readonly AdministrativeProvince[] {
    return this.administrativeDivisionService.findAllProvinces();
  }

  @Get('provinces/:provinceCode/wards')
  @Serialize(administrativeWardListSchema)
  findWardsByProvinceCode(
    @Param('provinceCode') provinceCode: string,
  ): readonly AdministrativeWard[] {
    return this.administrativeDivisionService.findWardsByProvinceCode(
      provinceCode,
    );
  }
}
