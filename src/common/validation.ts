import {
  BadRequestException,
  StandardSchemaValidationPipe,
} from '@nestjs/common';

export const createRequestValidationPipe = () =>
  new StandardSchemaValidationPipe({
    exceptionFactory: (issues) => {
      const errors = issues.map((issue) => ({
        path: (issue.path ?? []).map((segment) =>
          typeof segment === 'object' && segment !== null
            ? segment.key
            : segment,
        ),
        message: issue.message,
        code: 'code' in issue ? issue.code : 'custom',
      }));

      return new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: errors.map(({ path, message }) =>
          path.length ? `${path.map(String).join('.')}: ${message}` : message,
        ),
        errors,
      });
    },
  });
