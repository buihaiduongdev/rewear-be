import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { dbOptions } from './data-source';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        ...dbOptions,
        autoLoadEntities: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
