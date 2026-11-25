import type { DataSource } from 'typeorm';

import { runInitialDataSeed } from '@/database/seeds/initial-data.seed';
import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { ShopMemberRoleAssignment } from '@/modules/authorization/entities/shop-member-role-assignment.entity';
import { ShopRolePermission } from '@/modules/authorization/entities/shop-role-permission.entity';
import { ShopRole } from '@/modules/authorization/entities/shop-role.entity';
import { ShopRoleService } from '@/modules/authorization/shop-role.service';
import { Category } from '@/modules/category/entities';
import { Product } from '@/modules/product/entities';
import { ProductService } from '@/modules/product/product.service';
import { Shop, ShopMember } from '@/modules/shop/entities';
import { ShopInvitation } from '@/modules/shop/entities/shop-invitation.entity';
import { ShopMemberRole } from '@/modules/shop/enums';
import { ShopService } from '@/modules/shop/shop.service';

import { createTestDatabase } from '../support/database';
import type { TestDatabase } from '../support/database';

describe('Shop permissions', () => {
  let database: TestDatabase;
  let db: DataSource;
  let seed: Awaited<ReturnType<typeof runInitialDataSeed>>;
  beforeAll(async () => {
    database = await createTestDatabase();
    db = database.dataSource;
    seed = await db.transaction(runInitialDataSeed);
  });
  afterAll(async () => database?.destroy());

  it('combines assigned role permissions, isolates shops and applies revocation immediately', async () => {
    const shop = seed.shops[0];
    const user = seed.users[1];
    const member = await db.getRepository(ShopMember).save({
      shopId: shop.id,
      userId: user.id,
      memberRole: ShopMemberRole.STAFF,
    });
    const roles = await db.getRepository(ShopRole).save([
      { shopId: shop.id, name: 'Product', isDefault: false },
      { shopId: shop.id, name: 'Orders', isDefault: false },
    ]);
    await db.getRepository(ShopRolePermission).save([
      { roleId: roles[0].id, permissionKey: 'product.update' },
      { roleId: roles[1].id, permissionKey: 'order.view' },
      { roleId: roles[1].id, permissionKey: 'shop.owner' },
    ]);
    await db
      .getRepository(ShopMemberRoleAssignment)
      .save(roles.map((role) => ({ memberId: member.id, roleId: role.id })));
    const auth = new AuthorizationService(db);
    expect(await auth.hasPermission(user.id, shop.id, 'product.update')).toBe(
      true,
    );
    expect(await auth.hasPermission(user.id, shop.id, 'order.view')).toBe(true);
    expect(await auth.hasPermission(user.id, shop.id, 'shop.owner')).toBe(
      false,
    );
    expect(
      (await auth.getMemberPermissions(user.id, shop.id)).permissions,
    ).not.toContain('shop.owner');
    expect(
      await auth.hasPermission(seed.users[2].id, shop.id, 'shop.owner'),
    ).toBe(true);
    expect(
      await auth.hasPermission(user.id, seed.shops[1].id, 'product.update'),
    ).toBe(false);
    await db
      .getRepository(ShopRolePermission)
      .delete({ roleId: roles[0].id, permissionKey: 'product.update' });
    expect(await auth.hasPermission(user.id, shop.id, 'product.update')).toBe(
      false,
    );
    await db.getRepository(ShopMember).delete(member.id);
    expect(await auth.hasPermission(user.id, shop.id, 'order.view')).toBe(
      false,
    );
  });
  it('invites registered staff with roles, requires acceptance and allows leaving', async () => {
    const shop = seed.shops[0];
    const owner = seed.users[2];
    const staff = seed.users[5];
    const roles = new ShopRoleService(db);
    const invitations = new ShopService(
      db.getRepository(Shop),
      db.getRepository(ShopMember),
      db,
      new ShopRoleService(db),
      {} as never,
      { getPublicUrl: (key: string) => `https://public.test/${key}` } as never,
    );
    const defaults = await roles.list(shop.id);
    const staffRole = defaults.find(({ name }) => name === 'STAFF')!;
    expect(staffRole.permissions).toContain('product.update');
    expect(staffRole.permissions).not.toContain('shop.update');
    expect(
      defaults.find(({ name }) => name === 'MANAGER')?.permissions,
    ).toContain('shop.update');
    const invitation = await invitations.invite(shop.id, {
      email: staff.email,
      roleIds: [staffRole.id],
    });
    expect(invitation.roleIds).toEqual([staffRole.id]);
    expect((await invitations.findMyInvitations(staff.id))[0].roleIds).toEqual([
      staffRole.id,
    ]);
    expect(
      await db
        .getRepository(ShopMember)
        .findOneBy({ shopId: shop.id, userId: staff.id }),
    ).toBeNull();
    await expect(
      invitations.accept(seed.users[6].id, invitation.id),
    ).rejects.toMatchObject({ name: 'EntityNotFoundError' });
    const member = await invitations.accept(staff.id, invitation.id);
    const authorization = new AuthorizationService(db);
    expect(member.memberRole).toBe(ShopMemberRole.STAFF);
    expect(
      await authorization.getMemberPermissions(staff.id, shop.id),
    ).toMatchObject({
      isOwner: false,
      roles: ['STAFF'],
    });
    expect(
      await authorization.getMemberPermissions(owner.id, shop.id),
    ).toMatchObject({
      isOwner: true,
      roles: ['OWNER'],
    });
    expect(
      await authorization.hasPermission(staff.id, shop.id, 'product.update'),
    ).toBe(true);
    expect(
      await authorization.hasPermission(staff.id, shop.id, 'shop.update'),
    ).toBe(false);
    const products = new ProductService(
      db.getRepository(Product),
      db.getRepository(Category),
      db.getRepository(Shop),
      db.getRepository(ShopMember),
      db,
      authorization,
      { getPublicUrl: (key: string) => `https://public.test/${key}` } as never,
    );
    const product = await products.create(staff.id, {
      shopId: shop.id,
      title: 'Staff product',
    });
    expect((await products.findManagedProduct(product.id)).id).toBe(product.id);
    await expect(
      authorization.authorize(staff.id, shop.id, 'product.update'),
    ).resolves.toBeUndefined();
    await roles.update(shop.id, staffRole.id, { permissions: [] });
    await expect(
      authorization.authorize(staff.id, shop.id, 'product.update'),
    ).rejects.toThrow('Shop permission denied');
    expect(
      await authorization.hasPermission(staff.id, shop.id, 'product.update'),
    ).toBe(false);
    await expect(invitations.leave(shop.id, owner.id)).rejects.toThrow(
      'Owner must transfer ownership',
    );
    await invitations.leave(shop.id, staff.id);
    expect(
      await db.getRepository(ShopMember).findOneBy({ id: member.id }),
    ).toBeNull();
    expect(
      await db
        .getRepository(ShopMemberRoleAssignment)
        .findBy({ memberId: member.id }),
    ).toHaveLength(0);
    expect(
      await authorization.hasPermission(staff.id, shop.id, 'order.view'),
    ).toBe(false);
    const reinvitation = await invitations.invite(shop.id, {
      email: staff.email,
      roleIds: [staffRole.id],
    });
    const newMember = await invitations.accept(staff.id, reinvitation.id);
    await invitations.removeMember(shop.id, newMember.id);
    expect(
      await db.getRepository(ShopMember).findOneBy({ id: newMember.id }),
    ).toBeNull();
    expect(
      await db
        .getRepository(ShopMemberRoleAssignment)
        .findBy({ memberId: newMember.id }),
    ).toHaveLength(0);
  });

  it('rejects expired, revoked and cross-shop invitations', async () => {
    const shop = seed.shops[0];
    const staff = seed.users[6];
    const invitations = new ShopService(
      db.getRepository(Shop),
      db.getRepository(ShopMember),
      db,
      new ShopRoleService(db),
      {} as never,
      { getPublicUrl: (key: string) => `https://public.test/${key}` } as never,
    );
    const otherRole = (await new ShopRoleService(db).list(seed.shops[1].id))[0];
    await expect(
      invitations.invite(shop.id, {
        email: staff.email,
        roleIds: [otherRole.id],
      }),
    ).rejects.toThrow('Invalid shop roles');
    const expired = await invitations.invite(shop.id, {
      email: staff.email,
      roleIds: [],
    });
    await db
      .getRepository(ShopInvitation)
      .update(expired.id, { expiresAt: new Date(0) });
    await expect(invitations.accept(staff.id, expired.id)).rejects.toThrow(
      'Invitation is no longer valid',
    );
    const revoked = await invitations.invite(shop.id, {
      email: staff.email,
      roleIds: [],
    });
    await invitations.revoke(shop.id, revoked.id);
    await expect(invitations.accept(staff.id, revoked.id)).rejects.toThrow(
      'Invitation is no longer valid',
    );
  });
  it('rejects an invitation if a selected role no longer exists', async () => {
    const shop = seed.shops[0];
    const invitee = seed.users[6];
    const roles = new ShopRoleService(db);
    const invitations = new ShopService(
      db.getRepository(Shop),
      db.getRepository(ShopMember),
      db,
      new ShopRoleService(db),
      {} as never,
      { getPublicUrl: (key: string) => `https://public.test/${key}` } as never,
    );
    const role = await roles.create(shop.id, {
      name: 'Temporary',
      permissions: ['product.view'],
    });
    const invitation = await invitations.invite(shop.id, {
      email: invitee.email,
      roleIds: [role.id],
    });
    await db.getRepository(ShopRole).delete({ id: role.id });
    await expect(invitations.accept(invitee.id, invitation.id)).rejects.toThrow(
      'Invitation roles are no longer available',
    );
    expect(
      await db.getRepository(ShopMember).findOneBy({
        shopId: shop.id,
        userId: invitee.id,
      }),
    ).toBeNull();
    await invitations.revoke(shop.id, invitation.id);
  });
});
