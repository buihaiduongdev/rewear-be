import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import z from 'zod';

import { Serialize } from '@/common/decorators';

import { AdministrativeDivisionService } from './administrative-division.service';
import {
  administrativeDistrictListSchema,
  administrativeProvinceListSchema,
  administrativeWardListSchema,
} from './schemas';

@ApiTags('AdministrativeDivisions')
@Controller('administrative-divisions')
export class AdministrativeDivisionController {
  constructor(
    private readonly administrativeDivisionService: AdministrativeDivisionService,
  ) {}

  @Get('provinces')
  @Serialize(administrativeProvinceListSchema)
  findAllProvinces() {
    return this.administrativeDivisionService.findAllProvinces();
  }

  @Get('provinces/:provinceId/districts')
  @Serialize(administrativeDistrictListSchema)
  findDistrictsByProvinceId(
    @Param('provinceId', { schema: z.coerce.number().int().positive() })
    provinceId: number,
  ) {
    return this.administrativeDivisionService.findDistrictsByProvinceId(
      provinceId,
    );
  }

  @Get('districts/:districtId/wards')
  @Serialize(administrativeWardListSchema)
  findWardsByDistrictId(
    @Param('districtId', { schema: z.coerce.number().int().positive() })
    districtId: number,
  ) {
    return this.administrativeDivisionService.findWardsByDistrictId(districtId);
  }
}
