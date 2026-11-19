import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { z } from 'zod';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { RETURN_ACTION } from './constants/return.constant';
import { DisputeReturnService } from './return.service';
import {
  type ReturnActionInput,
  returnActionSchema,
  returnReviewSchema,
  returnViewSchema,
} from './schemas/return.schema';

const returnAdminActionSchema = z.enum([
  RETURN_ACTION.VERIFY_OBSTACLE,
  RETURN_ACTION.REJECT_OBSTACLE,
  RETURN_ACTION.RESUME,
  RETURN_ACTION.HANDOVER,
  RETURN_ACTION.DELIVERY,
  RETURN_ACTION.EXTEND,
  RETURN_ACTION.RESOLVE,
  RETURN_ACTION.RECOVER_HANDOVER,
]);
type ReturnAdminAction = z.output<typeof returnAdminActionSchema>;

@ApiTags('Dispute returns')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller()
export class DisputeReturnController {
  constructor(private readonly returns: DisputeReturnService) {}

  @Get('dispute-returns/:id')
  @Serialize(returnViewSchema)
  read(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.returns.read(user.id, id);
  }

  @Get('admin/dispute-returns/:id/review')
  @Roles(UserRole.ADMIN)
  @Serialize(returnReviewSchema)
  review(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.returns.read(user.id, id, true);
  }

  @Post('dispute-returns/:id/packing')
  @HttpCode(200)
  @Serialize(returnViewSchema)
  packing(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: returnActionSchema }) input: ReturnActionInput,
  ) {
    return this.returns.act(user.id, id, RETURN_ACTION.PACKING, input);
  }

  @Post('dispute-returns/:id/obstacles')
  @HttpCode(200)
  @Serialize(returnViewSchema)
  obstacle(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: returnActionSchema }) input: ReturnActionInput,
  ) {
    return this.returns.act(user.id, id, RETURN_ACTION.OBSTACLE, input);
  }

  @Post('dispute-returns/:id/objections')
  @HttpCode(200)
  @Serialize(returnViewSchema)
  objection(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: returnActionSchema }) input: ReturnActionInput,
  ) {
    return this.returns.act(user.id, id, RETURN_ACTION.OBJECTION, input);
  }

  @Post('dispute-returns/:id/accept-inspection')
  @HttpCode(200)
  @Serialize(returnViewSchema)
  accept(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: returnActionSchema }) input: ReturnActionInput,
  ) {
    return this.returns.act(
      user.id,
      id,
      RETURN_ACTION.ACCEPT_INSPECTION,
      input,
    );
  }

  @Post('admin/dispute-returns/:id/:action')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(returnViewSchema)
  admin(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Param('action', { schema: returnAdminActionSchema })
    action: ReturnAdminAction,
    @Body({ schema: returnActionSchema }) input: ReturnActionInput,
  ) {
    return this.returns.act(user.id, id, action, input);
  }
}
