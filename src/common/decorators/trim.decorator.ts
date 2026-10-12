import { Transform } from 'class-transformer';

export function Trim(): PropertyDecorator {
  return Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  );
}
