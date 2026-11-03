import { Module } from '@nestjs/common';

import { ProductModule } from '@/modules/product';

import { ShippingController } from './shipping.controller';

@Module({ imports: [ProductModule], controllers: [ShippingController] })
export class ShippingModule {}
