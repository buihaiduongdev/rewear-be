import { reconciliationMoney } from '@/modules/cod-reconciliation/cod-reconciliation.service';

describe('COD reconciliation money snapshot', () => {
  it('accepts the extra rounding coin allocated from a globally capped multi-Shop checkout', () => {
    expect(
      reconciliationMoney({
        subtotal: 19,
        shippingFee: 0,
        total: 17,
        coinDiscount: 2,
        commissionBasisPoints: 300,
        items: [{ productId: 'a', price: 19, coinDiscount: 2 }],
      }).gross,
    ).toBe(19);
  });
  it('funds the seller at gross goods value when platform coins reduce cash', () => {
    expect(
      reconciliationMoney({
        subtotal: 1000,
        shippingFee: 300,
        total: 1200,
        coinDiscount: 100,
        commissionBasisPoints: 300,
        items: [{ productId: 'a', price: 1000, coinDiscount: 100 }],
      }),
    ).toEqual({ gross: 1000, commission: 30, sellerNet: 970 });
  });
  it('floors commission per item, excludes shipping and preserves the order rate', () => {
    expect(
      reconciliationMoney({
        subtotal: 100,
        total: 30100,
        shippingFee: 30000,
        commissionBasisPoints: 300,
        items: [
          { productId: 'a', price: 50 },
          { productId: 'b', price: 50 },
        ],
      }),
    ).toEqual({ gross: 100, commission: 2, sellerNet: 98 });
  });
  it('supports the maximum PostgreSQL amount without imprecise multiplication', () => {
    expect(
      reconciliationMoney({
        subtotal: 2147483647,
        total: 2147483647,
        shippingFee: 0,
        commissionBasisPoints: 10000,
        items: [{ productId: 'a', price: 2147483647 }],
      }).sellerNet,
    ).toBe(0);
  });
  it.each([
    { subtotal: 99 },
    { total: 30099 },
    { commissionBasisPoints: 10001 },
    { shippingFee: -1 },
    {
      items: [
        { productId: 'a', price: 50 },
        { productId: 'a', price: 50 },
      ],
    },
    { items: [{ productId: 'a', price: 99.5 }] },
  ])('rejects invalid stored money rather than funding it (%j)', (change) => {
    expect(() =>
      reconciliationMoney({
        subtotal: 100,
        total: 30100,
        shippingFee: 30000,
        commissionBasisPoints: 300,
        items: [{ productId: 'a', price: 100 }],
        ...change,
      }),
    ).toThrow('Invalid order money');
  });
});
