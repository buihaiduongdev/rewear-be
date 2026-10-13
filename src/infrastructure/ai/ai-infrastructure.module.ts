import { Module } from '@nestjs/common';

import { AiInfrastructureService } from './ai-infrastructure.service';
import { GeminiProviderModule } from './provider/gemini/gemini.module';

@Module({
  imports: [GeminiProviderModule],
  providers: [AiInfrastructureService],
  exports: [AiInfrastructureService],
})
export class AiInfrastructureModule {}
