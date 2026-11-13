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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import {
  ApiPaginationQuery,
  Paginate,
  type Paginated,
  type PaginateQuery,
} from 'nestjs-paginate';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { uuidSchema } from '@/common/schemas/request.schema';
import { JwtAuthGuard, RolesGuard } from '@/modules/auth/guards';

import { User } from './entities';
import { UserRole } from './enums';
import { USER_PAGINATION_CONFIG } from './pagination.config';
import { userListSchema, userSchema } from './schemas';
import {
  createUserSchema,
  updateProfileSchema,
  updateUserSchema,
} from './schemas/user-input.schema';
import type {
  CreateUserInput,
  UpdateProfileInput,
  UpdateUserInput,
} from './schemas/user-input.schema';
import { UserService } from './user.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @Serialize(userSchema)
  getMe(@CurrentUser() currentUser: User): Promise<User> {
    return this.userService.findById(currentUser.id);
  }

  @Patch('me')
  @Roles(UserRole.USER, UserRole.ADMIN)
  @Serialize(userSchema)
  updateMe(
    @CurrentUser() currentUser: User,
    @Body({ schema: updateProfileSchema }) input: UpdateProfileInput,
  ): Promise<User> {
    return this.userService.updateProfile(currentUser.id, input);
  }

  @Get()
  @Serialize(userListSchema)
  @ApiPaginationQuery(USER_PAGINATION_CONFIG)
  findAll(@Paginate() query: PaginateQuery): Promise<Paginated<User>> {
    return this.userService.findAll(query);
  }

  @Get(':id')
  @Serialize(userSchema)
  findOne(@Param('id', { schema: uuidSchema }) id: string): Promise<User> {
    return this.userService.findById(id);
  }

  @Post()
  @Serialize(userSchema, { status: HttpStatus.CREATED })
  create(
    @Body({ schema: createUserSchema }) input: CreateUserInput,
  ): Promise<User> {
    return this.userService.create(input);
  }

  @Patch(':id')
  @Serialize(userSchema)
  update(
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateUserSchema }) input: UpdateUserInput,
  ): Promise<User> {
    return this.userService.update(id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', { schema: uuidSchema }) id: string): Promise<void> {
    return this.userService.remove(id);
  }
}
