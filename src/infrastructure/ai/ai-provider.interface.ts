export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface IAiResponseFormat {
  schema: Record<string, unknown>;
}

export interface IAiGenerateInput {
  instructions: string;
  model?: string;
  prompt: string;
  responseFormat?: IAiResponseFormat;
}

export interface IAiGenerateResult {
  modelName: string;
  rawResponse: string;
  tokensUsed: number | null;
}

export interface IAiProvider {
  generate(input: IAiGenerateInput): Promise<IAiGenerateResult>;
}
