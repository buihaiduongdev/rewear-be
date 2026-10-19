import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Serialize } from '@/common/decorators';
import { JwtAuthGuard } from '@/modules/auth/guards';
import { User } from '@/modules/user/entities';

import { CreateUserAddressDto, UpdateUserAddressDto } from './dto';
import { UserAddress } from './entities';
import { userAddressListSchema, userAddressSchema } from './schemas';
import { UserAddressService } from './user-address.service';

@ApiTags('User Addresses')
@ApiBearerAuth()
@Controller('user-addresses')
@UseGuards(JwtAuthGuard)
export class UserAddressController {
  constructor(private readonly userAddressService: UserAddressService) {}

  @Get()
  @Serialize(userAddressListSchema)
  findAll(@CurrentUser() currentUser: User): Promise<UserAddress[]> {
    return this.userAddressService.findAll(currentUser.id);
  }

  @Get(':id')
  @Serialize(userAddressSchema)
  findOne(
    @CurrentUser() currentUser: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserAddress> {
    return this.userAddressService.findOne(currentUser.id, id);
  }

  @Post()
  @Serialize(userAddressSchema, { status: HttpStatus.CREATED })
  create(
    @CurrentUser() currentUser: User,
    @Body() input: CreateUserAddressDto,
  ): Promise<UserAddress> {
    return this.userAddressService.create(currentUser.id, input);
  }

  @Patch(':id')
  @Serialize(userAddressSchema)
  update(
    @CurrentUser() currentUser: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateUserAddressDto,
  ): Promise<UserAddress> {
    return this.userAddressService.update(currentUser.id, id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() currentUser: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.userAddressService.remove(currentUser.id, id);
  }
}
