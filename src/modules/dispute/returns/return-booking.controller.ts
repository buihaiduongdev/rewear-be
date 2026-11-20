import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import z from 'zod';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';
import { UserRole } from '@/modules/user/enums';

import { ReturnBookingService } from './return-booking.service';
import {
  type ReturnBookingInput,
  returnBookingInputSchema,
  returnBookingViewSchema,
} from './schemas/return-booking.schema';

@ApiTags('Dispute returns')
@ApiBearerAuth()
@AuthenticatedAccess()
@Controller()
export class ReturnBookingController {
  constructor(private readonly bookings: ReturnBookingService) {}
  @Post('admin/dispute-returns/:id/booking')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(returnBookingViewSchema)
  book(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: returnBookingInputSchema }) input: ReturnBookingInput,
  ) {
    return this.bookings.book(user.id, id, input);
  }
  @Post('admin/dispute-returns/:id/booking/reissue')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(returnBookingViewSchema)
  reissue(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: returnBookingInputSchema }) input: ReturnBookingInput,
  ) {
    return this.bookings.reissue(user.id, id, input);
  }
  @Post('admin/dispute-returns/:id/booking/refresh')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(returnBookingViewSchema)
  refresh(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: z.strictObject({}) }) _input: Record<string, never>,
  ) {
    return this.bookings.refresh(user.id, id);
  }
  @Get('dispute-returns/:id/booking')
  @Serialize(returnBookingViewSchema.nullable())
  view(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.bookings.view(user.id, id);
  }
  @Get('admin/dispute-returns/:id/booking')
  @Roles(UserRole.ADMIN)
  @Serialize(returnBookingViewSchema.nullable())
  adminView(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ) {
    return this.bookings.view(user.id, id, true);
  }
  @Post('dispute-returns/:id/booking/print')
  @HttpCode(200)
  @Serialize(z.object({ url: z.url() }))
  print(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: z.strictObject({}) }) _input: Record<string, never>,
  ) {
    return this.bookings.print(user.id, id);
  }
  @Post('admin/dispute-returns/:id/booking/print')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Serialize(z.object({ url: z.url() }))
  adminPrint(
    @CurrentUser() user: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: z.strictObject({}) }) _input: Record<string, never>,
  ) {
    return this.bookings.print(user.id, id, true);
  }
}
