import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Serialize } from '@/common/decorators';
import { PublicAccess } from '@/modules/authorization/decorators/public-access.decorator';

import { AdministrativeDivisionService } from './administrative-division.service';
import type { AdministrativeProvince, AdministrativeWard } from './data';
import {
  administrativeProvinceListSchema,
  administrativeProvinceSchema,
  administrativeWardListSchema,
} from './schemas';

@ApiTags('Administrative divisions')
@Controller('administrative-divisions')
export class AdministrativeDivisionController {
  constructor(
    private readonly administrativeDivisionService: AdministrativeDivisionService,
  ) {}

  @PublicAccess()
  @Get('provinces')
  @Serialize(administrativeProvinceListSchema)
  findAllProvinces(): readonly AdministrativeProvince[] {
    return this.administrativeDivisionService.findAllProvinces();
  }

  @PublicAccess()
  @Get('provinces/:provinceCode/wards')
  @Serialize(administrativeWardListSchema)
  findWardsByProvinceCode(
    @Param('provinceCode', { schema: administrativeProvinceSchema.shape.code })
    provinceCode: string,
  ): readonly AdministrativeWard[] {
    return this.administrativeDivisionService.findWardsByProvinceCode(
      provinceCode,
    );
  }
}
