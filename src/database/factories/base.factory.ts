import type { DeepPartial, ObjectLiteral, Repository } from 'typeorm';

export abstract class BaseFactory<T extends ObjectLiteral> {
  constructor(protected readonly repository?: Repository<T>) {}

  abstract definition(): DeepPartial<T>;

  build(override: DeepPartial<T> = {} as DeepPartial<T>): T {
    const defaultData = this.definition();
    const merged = Object.assign({}, defaultData, override);
    if (this.repository) {
      return this.repository.create(merged) as unknown as T;
    }
    return merged as unknown as T;
  }

  buildMany(
    count: number,
    override: DeepPartial<T> = {} as DeepPartial<T>,
  ): T[] {
    return Array.from({ length: count }, () => this.build(override));
  }

  async create(override: DeepPartial<T> = {} as DeepPartial<T>): Promise<T> {
    if (!this.repository) {
      throw new Error(
        'Repository is required to persist entity with create().',
      );
    }
    const entity = this.build(override);
    return await this.repository.save(entity);
  }

  async createMany(
    count: number,
    override: DeepPartial<T> = {} as DeepPartial<T>,
  ): Promise<T[]> {
    if (!this.repository) {
      throw new Error(
        'Repository is required to persist entities with createMany().',
      );
    }
    const entities = this.buildMany(count, override);
    return await this.repository.save(entities);
  }
}
