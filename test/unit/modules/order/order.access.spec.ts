import { EntityManager } from 'typeorm';

import { OrderAccess } from '@/modules/order/order.access';

describe('Shop order access failure handling', () => {
  it('does not hide database failures as missing membership permissions', async () => {
    const unavailable = new Error('database unavailable');
    const manager = { findOneOrFail: jest.fn().mockRejectedValue(unavailable) };
    await expect(
      new OrderAccess().assertManage(
        manager as unknown as EntityManager,
        'user',
        'shop',
      ),
    ).rejects.toBe(unavailable);
  });
});
