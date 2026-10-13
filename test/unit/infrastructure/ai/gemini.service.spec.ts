import { GoogleGenAI } from '@google/genai';

import type { IAiGenerateInput } from '@/infrastructure/ai/ai-provider.interface';
import { GeminiService } from '@/infrastructure/ai/provider/gemini/gemini.service';
import type { ConfigService } from '@/modules/config/config.service';
import type { TAiConfig } from '@/modules/config/schemas';

jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn() }));

describe('GeminiService', () => {
  const generateContent = jest.fn();
  const input: IAiGenerateInput = {
    prompt: 'Describe this jacket',
    instructions: 'Write a concise product description',
  };
  let ai: TAiConfig;
  let service: GeminiService;

  beforeEach(() => {
    jest.resetAllMocks();
    ai = { apiKey: 'test-api-key', model: 'default-model' };
    service = new GeminiService({ ai } as ConfigService);
    jest
      .mocked(GoogleGenAI)
      .mockImplementation(
        () => ({ models: { generateContent } }) as unknown as GoogleGenAI,
      );
    generateContent.mockResolvedValue({
      text: 'A denim jacket',
      usageMetadata: { totalTokenCount: 42 },
    });
  });

  it('uses the configured model and maps the SDK response', async () => {
    await expect(service.generate(input)).resolves.toEqual({
      modelName: 'default-model',
      rawResponse: 'A denim jacket',
      tokensUsed: 42,
    });
    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
      httpOptions: { timeout: 15000 },
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent).toHaveBeenCalledWith({
      model: 'default-model',
      contents: input.prompt,
      config: {
        systemInstruction: input.instructions,
        responseMimeType: undefined,
        responseJsonSchema: undefined,
      },
    });
  });

  it('allows the caller to override the model', async () => {
    await expect(
      service.generate({ ...input, model: 'custom-model' }),
    ).resolves.toMatchObject({ modelName: 'custom-model' });
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'custom-model' }),
    );
  });

  it('passes a structured response schema to the SDK', async () => {
    const schema = {
      type: 'object',
      properties: { description: { type: 'string' } },
      required: ['description'],
    };
    generateContent.mockResolvedValueOnce({
      text: '{"description":"A denim jacket"}',
    });

    await expect(
      service.generate({ ...input, responseFormat: { schema } }),
    ).resolves.toMatchObject({
      rawResponse: '{"description":"A denim jacket"}',
    });
    expect(generateContent).toHaveBeenCalledWith({
      model: 'default-model',
      contents: input.prompt,
      config: {
        systemInstruction: input.instructions,
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
      },
    });
  });

  it.each([{ text: 'Response' }, { text: 'Response', usageMetadata: {} }])(
    'returns null when token usage is missing: %j',
    async (response) => {
      generateContent.mockResolvedValueOnce(response);

      await expect(service.generate(input)).resolves.toMatchObject({
        tokensUsed: null,
      });
    },
  );

  it('preserves a zero token count', async () => {
    generateContent.mockResolvedValueOnce({
      text: 'Response',
      usageMetadata: { totalTokenCount: 0 },
    });

    await expect(service.generate(input)).resolves.toMatchObject({
      tokensUsed: 0,
    });
  });

  it('rejects a missing API key before creating the SDK client', async () => {
    delete ai.apiKey;

    await expect(service.generate(input)).rejects.toThrow(
      'Gemini is not configured',
    );
    expect(GoogleGenAI).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it.each([undefined, ''])('rejects an empty response: %s', async (text) => {
    generateContent.mockResolvedValueOnce({ text });

    await expect(service.generate(input)).rejects.toThrow(
      'Gemini returned no response',
    );
  });

  it('preserves an SDK error', async () => {
    const error = new Error('Quota exceeded');
    generateContent.mockRejectedValueOnce(error);

    await expect(service.generate(input)).rejects.toBe(error);
  });

  it('normalizes a non-Error rejection', async () => {
    generateContent.mockRejectedValueOnce('upstream failure');

    await expect(service.generate(input)).rejects.toThrow(
      'Gemini generation failed',
    );
  });
});
