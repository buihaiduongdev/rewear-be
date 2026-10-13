import { Module } from '@nestjs/common';

import { AI_PROVIDER } from '../../ai-provider.interface';
import { GeminiService } from './gemini.service';

@Module({
  providers: [{ provide: AI_PROVIDER, useClass: GeminiService }],
  exports: [AI_PROVIDER],
})
export class GeminiProviderModule {}
