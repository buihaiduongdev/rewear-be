import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { DataSource, Repository } from 'typeorm';

import { CreateUserAddressDto, UpdateUserAddressDto } from './dto';
import { UserAddress } from './entities';

@Injectable()
export class UserAddressService {
  constructor(
    @InjectRepository(UserAddress)
    private readonly userAddressRepository: Repository<UserAddress>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(userId: string): Promise<UserAddress[]> {
    return this.userAddressRepository.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(userId: string, id: string): Promise<UserAddress> {
    const address = await this.userAddressRepository.findOneBy({ id, userId });
    if (!address) throw new NotFoundException('User address not found');
    return address;
  }

  async create(
    userId: string,
    input: CreateUserAddressDto,
  ): Promise<UserAddress> {
    const address = this.userAddressRepository.create({
      ...input,
      userId,
      label: input.label ?? null,
      addressLine2: input.addressLine2 ?? null,
      countryCode: input.countryCode ?? 'VN',
      postalCode: input.postalCode ?? null,
      deliveryInstructions: input.deliveryInstructions ?? null,
      isDefault: input.isDefault ?? false,
    });

    return address.isDefault
      ? this.saveAsDefault(userId, address)
      : this.userAddressRepository.save(address);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateUserAddressDto,
  ): Promise<UserAddress> {
    const address = await this.findOne(userId, id);
    Object.assign(address, input);

    return input.isDefault === true
      ? this.saveAsDefault(userId, address)
      : this.userAddressRepository.save(address);
  }

  async remove(userId: string, id: string): Promise<void> {
    const address = await this.findOne(userId, id);
    await this.userAddressRepository.remove(address);
  }

  private saveAsDefault(
    userId: string,
    address: UserAddress,
  ): Promise<UserAddress> {
    return this.dataSource.transaction(async (manager) => {
      await manager.update(
        UserAddress,
        { userId, isDefault: true },
        { isDefault: false },
      );
      return manager.save(UserAddress, address);
    });
  }
}
