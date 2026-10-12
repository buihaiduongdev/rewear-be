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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles, Serialize } from '@/common/decorators';
import { JwtAuthGuard, RolesGuard } from '@/modules/auth/guards';

import { CreateUserDto, UpdateProfileDto, UpdateUserDto } from './dto';
import { User } from './entities';
import { UserRole } from './enums';
import { userListSchema, userSchema } from './schemas';
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
    @Body() input: UpdateProfileDto,
  ): Promise<User> {
    return this.userService.updateProfile(currentUser.id, input);
  }

  @Get()
  @Serialize(userListSchema)
  findAll(@Query('search') search?: string): Promise<User[]> {
    return this.userService.findAll(search);
  }

  @Get(':id')
  @Serialize(userSchema)
  findOne(@Param('id') id: string): Promise<User> {
    return this.userService.findById(id);
  }

  @Post()
  @Serialize(userSchema)
  create(@Body() input: CreateUserDto): Promise<User> {
    return this.userService.create(input);
  }

  @Patch(':id')
  @Serialize(userSchema)
  update(@Param('id') id: string, @Body() input: UpdateUserDto): Promise<User> {
    return this.userService.update(id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.userService.remove(id);
  }
}
