import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { AuthenticatedAccess } from '@/modules/authorization/decorators/authenticated-access.decorator';
import { User } from '@/modules/user/entities';

import { UserAddress } from './entities';
import { userAddressListSchema, userAddressSchema } from './schemas';
import {
  createUserAddressSchema,
  updateUserAddressSchema,
} from './schemas/user-address-input.schema';
import type {
  CreateUserAddressInput,
  UpdateUserAddressInput,
} from './schemas/user-address-input.schema';
import { UserAddressService } from './user-address.service';

@ApiTags('User Addresses')
@ApiBearerAuth()
@Controller('user-addresses')
export class UserAddressController {
  constructor(private readonly userAddressService: UserAddressService) {}

  @AuthenticatedAccess()
  @Get()
  @Serialize(userAddressListSchema)
  findAll(@CurrentUser() currentUser: User): Promise<UserAddress[]> {
    return this.userAddressService.findAll(currentUser.id);
  }

  @AuthenticatedAccess()
  @Get(':id')
  @Serialize(userAddressSchema)
  findOne(
    @CurrentUser() currentUser: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<UserAddress> {
    return this.userAddressService.findOne(currentUser.id, id);
  }

  @AuthenticatedAccess()
  @Post()
  @Serialize(userAddressSchema, { status: HttpStatus.CREATED })
  create(
    @CurrentUser() currentUser: User,
    @Body({ schema: createUserAddressSchema }) input: CreateUserAddressInput,
  ): Promise<UserAddress> {
    return this.userAddressService.create(currentUser.id, input);
  }

  @AuthenticatedAccess()
  @Patch(':id')
  @Serialize(userAddressSchema)
  update(
    @CurrentUser() currentUser: User,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateUserAddressSchema }) input: UpdateUserAddressInput,
  ): Promise<UserAddress> {
    return this.userAddressService.update(currentUser.id, id, input);
  }

  @AuthenticatedAccess()
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() currentUser: User,
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<void> {
    return this.userAddressService.remove(currentUser.id, id);
  }
}
