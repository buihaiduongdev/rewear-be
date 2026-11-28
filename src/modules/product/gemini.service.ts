import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import z from 'zod';

import type { SuggestDescriptionInput } from './schemas/product-input.schema';
import type { SuggestDescriptionResponse } from './schemas/product.schema';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_DESCRIPTION_LENGTH = 5000;

const SYSTEM_INSTRUCTION = [
  'Bạn là trợ lý viết mô tả sản phẩm cho sàn thời trang secondhand Re.wear.',
  'Hãy viết một đoạn mô tả tiếng Việt tự nhiên, rõ ràng, trung thực và hấp dẫn dựa CHỈ trên thông tin người bán cung cấp.',
  'Không bịa thêm chi tiết không có trong dữ liệu; nếu có khuyết điểm hoặc sửa chữa, hãy nêu minh bạch và lịch sự.',
  'Chỉ trả về văn bản mô tả thuần (không dùng markdown code block, không kèm lời giải thích ngoài lề).',
].join(' ');

const geminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(z.object({ text: z.string().optional() }))
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);

  async suggestProductDescription(
    input: SuggestDescriptionInput,
  ): Promise<SuggestDescriptionResponse> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI description suggestion is currently unavailable',
      );
    }

    const prompt = this.buildPrompt(input);
    const endpoint = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 600,
          },
        }),
      });

      if (!response.ok) {
        this.logger.warn(`Gemini API returned status ${response.status}`);
        throw new ServiceUnavailableException(
          'AI description suggestion is currently unavailable',
        );
      }

      const parsed = geminiResponseSchema.safeParse(await response.json());
      const description = parsed.success
        ? parsed.data.candidates?.[0]?.content?.parts
            ?.map((part) => part.text ?? '')
            .join('')
            .trim()
        : '';

      if (!description) {
        this.logger.warn('Gemini API returned an empty description');
        throw new ServiceUnavailableException(
          'AI description suggestion is currently unavailable',
        );
      }

      return {
        description: description.slice(0, MAX_DESCRIPTION_LENGTH),
        model,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      this.logger.warn(
        `Gemini API request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        'AI description suggestion is currently unavailable',
      );
    }
  }

  private buildPrompt(input: SuggestDescriptionInput): string {
    const lines: string[] = [`Tên sản phẩm: ${input.title}`];

    if (input.categoryName) lines.push(`Danh mục: ${input.categoryName}`);
    if (input.brand) lines.push(`Thương hiệu: ${input.brand}`);
    if (input.condition) lines.push(`Độ mới: ${input.condition}`);
    if (input.size) lines.push(`Kích cỡ: ${input.size}`);
    if (input.color) lines.push(`Màu sắc: ${input.color}`);
    if (input.material) lines.push(`Chất liệu: ${input.material}`);

    if (input.measurements && Object.keys(input.measurements).length > 0) {
      const formatted = Object.entries(input.measurements)
        .map(([key, value]) => `${key}: ${value}cm`)
        .join(', ');
      lines.push(`Số đo: ${formatted}`);
    }

    if (input.repairs) lines.push(`Sửa chữa đã thực hiện: ${input.repairs}`);
    if (input.defects?.length) {
      lines.push(`Khuyết điểm: ${input.defects.join('; ')}`);
    }
    if (input.notes) lines.push(`Ghi chú thêm: ${input.notes}`);

    return lines.join('\n');
  }
}
