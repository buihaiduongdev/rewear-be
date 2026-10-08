import { Module } from '@nestjs/common';

import { ConfigModule } from './modules/config';

@Module({
  imports: [ConfigModule],
})
export class AppModule {}
