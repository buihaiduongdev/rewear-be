import { AiInfrastructureService } from '@/infrastructure/ai/ai-infrastructure.service';
import type {
  IAiGenerateInput,
  IAiProvider,
} from '@/infrastructure/ai/ai-provider.interface';

describe('AiInfrastructureService', () => {
  const generate = jest.fn<
    ReturnType<IAiProvider['generate']>,
    Parameters<IAiProvider['generate']>
  >();
  const provider: IAiProvider = { generate };
  const service = new AiInfrastructureService(provider);
  const input: IAiGenerateInput = {
    prompt: 'Describe this jacket',
    instructions: 'Be concise',
    model: 'custom-model',
    responseFormat: { schema: { type: 'object' } },
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('forwards all input options and returns the provider result', async () => {
    const result = {
      modelName: 'custom-model',
      rawResponse: '{"description":"A jacket"}',
      tokensUsed: 10,
    };
    generate.mockResolvedValueOnce(result);

    await expect(service.generate(input)).resolves.toBe(result);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(input);
  });

  it('propagates provider errors', async () => {
    const error = new Error('Generation failed');
    generate.mockRejectedValueOnce(error);

    await expect(service.generate(input)).rejects.toBe(error);
  });
});
