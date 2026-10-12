import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export class OrmFilterBuilder<T extends ObjectLiteral> {
  private paramCounter = 0;

  constructor(private readonly queryBuilder: SelectQueryBuilder<T>) {}

  static create<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
  ): OrmFilterBuilder<T> {
    return new OrmFilterBuilder<T>(qb);
  }

  private isValid(value: unknown): boolean {
    if (value === undefined || value === null || value === '') {
      return false;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return true;
  }

  private getParamName(column: string, suffix: string): string {
    const cleanColumn = column.replace(/[^a-zA-Z0-9_]/g, '_');
    this.paramCounter += 1;
    return `${cleanColumn}_${suffix}_${this.paramCounter}`;
  }

  private apply(
    column: string,
    suffix: string,
    operatorSql: string,
    value: unknown,
    options?: {
      transform?: (v: unknown) => unknown;
    },
  ): this {
    if (this.isValid(value)) {
      const paramName = this.getParamName(column, suffix);
      const finalValue = options?.transform ? options.transform(value) : value;
      this.queryBuilder.andWhere(`${column} ${operatorSql} :${paramName}`, {
        [paramName]: finalValue,
      });
    }

    return this;
  }

  private applyWithoutParameter(
    conditionSql: string | undefined,
    options?: { parameters?: ObjectLiteral; when?: boolean },
  ): this {
    if (conditionSql && (options?.when ?? true)) {
      this.queryBuilder.andWhere(conditionSql, options?.parameters);
    }

    return this;
  }

  ilike(column: string, value: unknown): this {
    return this.apply(column, 'ilike', 'ILIKE', value, {
      transform: (v) => `%${String(v)}%`,
    });
  }

  equal(column: string, value: unknown): this {
    return this.apply(column, 'eq', '=', value);
  }

  notEqual(column: string, value: unknown): this {
    return this.apply(column, 'neq', '!=', value);
  }

  in(column: string, values: unknown[] | undefined | null): this {
    if (this.isValid(values)) {
      const paramName = this.getParamName(column, 'in');
      this.queryBuilder.andWhere(`${column} IN (:...${paramName})`, {
        [paramName]: values,
      });
    }
    return this;
  }

  gte(column: string, value: unknown): this {
    return this.apply(column, 'gte', '>=', value);
  }

  lte(column: string, value: unknown): this {
    return this.apply(column, 'lte', '<=', value);
  }

  isNull(column: string, condition: boolean | undefined | null = true): this {
    return this.applyWithoutParameter(`${column} IS NULL`, {
      when: Boolean(condition),
    });
  }

  isNotNull(
    column: string,
    condition: boolean | undefined | null = true,
  ): this {
    return this.applyWithoutParameter(`${column} IS NOT NULL`, {
      when: Boolean(condition),
    });
  }

  andWhere(
    conditionSql: string | undefined,
    parameters?: ObjectLiteral,
    condition = true,
  ): this {
    return this.applyWithoutParameter(conditionSql, {
      parameters,
      when: condition,
    });
  }

  between(column: string, from: unknown, to: unknown): this {
    this.gte(column, from);
    this.lte(column, to);
    return this;
  }

  booleanCondition(
    column: string,
    condition: boolean | undefined | null,
    isTrueOp: string,
    isFalseOp: string,
    value: unknown,
  ): this {
    if (condition !== undefined && condition !== null) {
      const operator = condition ? isTrueOp : isFalseOp;
      return this.apply(column, 'cond', operator, value);
    }
    return this;
  }

  getQueryBuilder(): SelectQueryBuilder<T> {
    return this.queryBuilder;
  }
}
