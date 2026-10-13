import { Injectable } from '@nestjs/common';

import { GoogleGenAI } from '@google/genai';
import ms from 'ms';

import type {
  IAiGenerateInput,
  IAiGenerateResult,
  IAiProvider,
} from '@/infrastructure/ai/ai-provider.interface';
import { ConfigService } from '@/modules/config/config.service';

@Injectable()
export class GeminiService implements IAiProvider {
  constructor(private readonly configService: ConfigService) {}

  async generate({
    model,
    prompt: contents,
    instructions: systemInstruction,
    responseFormat,
  }: IAiGenerateInput): Promise<IAiGenerateResult> {
    const { apiKey, model: defaultModel } = this.configService.ai;
    model = model || defaultModel;

    if (!apiKey) throw new Error('Gemini is not configured');

    try {
      const client = new GoogleGenAI({
        apiKey,
        httpOptions: { timeout: ms('15s') },
      });
      const { text, usageMetadata: { totalTokenCount: tokensUsed } = {} } =
        await client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            responseMimeType: responseFormat ? 'application/json' : undefined,
            responseJsonSchema: responseFormat?.schema,
          },
        });

      if (!text) {
        throw new Error('Gemini returned no response');
      }

      return {
        modelName: model,
        rawResponse: text,
        tokensUsed: tokensUsed ?? null,
      };
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error('Gemini generation failed');
    }
  }
}
