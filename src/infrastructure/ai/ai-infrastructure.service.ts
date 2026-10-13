import { Inject, Injectable } from '@nestjs/common';

import { AI_PROVIDER } from './ai-provider.interface';
import type {
  IAiGenerateInput,
  IAiGenerateResult,
  IAiProvider,
} from './ai-provider.interface';

@Injectable()
export class AiInfrastructureService {
  constructor(
    @Inject(AI_PROVIDER)
    private readonly provider: IAiProvider,
  ) {}

  async generate(input: IAiGenerateInput): Promise<IAiGenerateResult> {
    return this.provider.generate(input);
  }
}
