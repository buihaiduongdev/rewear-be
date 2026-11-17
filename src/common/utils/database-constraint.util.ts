import { ConflictException } from '@nestjs/common';

import { QueryFailedError } from 'typeorm';

export interface DatabaseConstraintViolation {
  constraint?: string;
  code?: string;
  detail?: string;
}

/**
 * Maps known PostgreSQL constraint names or unique violations to HTTP ConflictException.
 * If the error is not a recognized constraint violation, it is re-thrown as-is.
 */
export function handleDatabaseConstraint(
  error: unknown,
  constraintMap: Record<string, string>,
): never {
  if (error instanceof QueryFailedError) {
    const driverError = error.driverError as
      DatabaseConstraintViolation | undefined;
    const constraint = driverError?.constraint;

    if (constraint && constraintMap[constraint]) {
      throw new ConflictException(constraintMap[constraint]);
    }
  }

  throw error;
}
