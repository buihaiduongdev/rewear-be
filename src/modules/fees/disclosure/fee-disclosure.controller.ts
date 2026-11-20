import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import {
  AuthenticatedAccess,
  PublicAccess,
} from '@/modules/authorization/decorators';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import {
  feePolicyAcceptanceSchema,
  type FeePolicyPublishInput,
  feePolicyPublishSchema,
} from './fee-disclosure.schema';
import { FeeDisclosureService } from './fee-disclosure.service';

@ApiTags('Fee disclosure')
@Controller()
export class FeeDisclosureController {
  constructor(private readonly service: FeeDisclosureService) {}
  @PublicAccess()
  @Get('fee-policies/current')
  current() {
    return this.service.current();
  }
  @AuthenticatedAccess()
  @Roles(UserRole.ADMIN)
  @Post('admin/fee-policies')
  publish(
    @CurrentUser() user: User,
    @Body({ schema: feePolicyPublishSchema }) input: FeePolicyPublishInput,
  ) {
    return this.service.publish(user.id, input);
  }
  @AuthenticatedAccess()
  @Post('shops/:id/fee-policy-acceptance')
  accept(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) shopId: string,
    @Body({ schema: feePolicyAcceptanceSchema })
    input: { policyId: string; accepted: true },
  ) {
    return this.service.accept(user.id, shopId, input.policyId);
  }
}
