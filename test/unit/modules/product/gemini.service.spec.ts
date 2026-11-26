import { ServiceUnavailableException } from '@nestjs/common';

import { ProductCondition } from '@/modules/product/enums';
import { GeminiService } from '@/modules/product/gemini.service';
import { suggestDescriptionSchema } from '@/modules/product/schemas';

describe('GeminiService', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;

  let service: GeminiService;
  let fetchSpy: jest.SpiedFunction<typeof global.fetch>;

  beforeEach(() => {
    service = new GeminiService();
    fetchSpy = jest.spyOn(global, 'fetch');
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    delete process.env.GEMINI_MODEL;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
  });

  it('generates a Vietnamese product description from form fields', async () => {
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '  Áo khoác denim Levi’s size M màu xanh, độ mới tốt, phù hợp mặc hằng ngày.  ',
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await service.suggestProductDescription({
      title: 'Áo khoác denim cổ điển',
      categoryName: 'Áo khoác',
      brand: 'Levis',
      condition: ProductCondition.GOOD,
      size: 'M',
      color: 'Xanh dương',
      material: 'Denim 100% cotton',
      measurements: { chest: 54, length: 64 },
      defects: ['Bạc nhẹ phần cổ tay'],
    });

    expect(result).toEqual({
      description:
        'Áo khoác denim Levi’s size M màu xanh, độ mới tốt, phù hợp mặc hằng ngày.',
      model: 'gemini-2.5-flash',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    );
    expect(url).not.toContain('test-gemini-key');
    expect(init?.headers).toEqual({
      'Content-Type': 'application/json',
      'x-goog-api-key': 'test-gemini-key',
    });
    const body = JSON.parse(String(init?.body)) as {
      contents: { parts: { text: string }[] }[];
    };
    expect(body.contents[0].parts[0].text).toContain('Áo khoác denim cổ điển');
    expect(body.contents[0].parts[0].text).toContain('Bạc nhẹ phần cổ tay');
    expect(body.contents[0].parts[0].text).toContain(
      'chest: 54cm, length: 64cm',
    );
  });

  it('throws ServiceUnavailableException when GEMINI_API_KEY is missing', async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(
      service.suggestProductDescription({ title: 'Áo sơ mi trắng' }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws ServiceUnavailableException when Gemini responds with non-2xx status', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Quota exceeded' } }), {
        status: 429,
      }),
    );

    await expect(
      service.suggestProductDescription({ title: 'Áo sơ mi trắng' }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('throws ServiceUnavailableException when Gemini times out or fails over network', async () => {
    fetchSpy.mockRejectedValueOnce(
      new DOMException('Timed out', 'TimeoutError'),
    );

    await expect(
      service.suggestProductDescription({ title: 'Áo sơ mi trắng' }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('throws ServiceUnavailableException when Gemini returns empty content', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ candidates: [] }), { status: 200 }),
    );

    await expect(
      service.suggestProductDescription({ title: 'Áo sơ mi trắng' }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('validates suggestDescriptionSchema input strictly', () => {
    expect(suggestDescriptionSchema.safeParse({}).success).toBe(false);
    expect(
      suggestDescriptionSchema.safeParse({
        title: '  Quần jean ống suông  ',
        unknownField: true,
      }).success,
    ).toBe(false);
    expect(
      suggestDescriptionSchema.parse({
        title: '  Quần jean ống suông  ',
        brand: '  Uniqlo ',
      }),
    ).toEqual({
      title: 'Quần jean ống suông',
      brand: 'Uniqlo',
    });
  });
});
