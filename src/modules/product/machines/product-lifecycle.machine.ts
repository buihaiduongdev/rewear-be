import { createActor, setup } from 'xstate';

import { ProductStatus } from '@/modules/product/enums';

export type ProductLifecycleEvent =
  | { type: 'SUBMIT_FOR_REVIEW' }
  | { type: 'WITHDRAW_REVIEW' }
  | { type: 'APPROVE' }
  | { type: 'REJECT'; reason?: string }
  | { type: 'HIDE' }
  | { type: 'UNHIDE' }
  | { type: 'HOLD' }
  | { type: 'RELEASE_HOLD' }
  | { type: 'SELL' }
  | { type: 'SUSPEND'; reason?: string };

/**
 * XState State Machine quản lý toàn bộ vòng đời chuyển trạng thái của Sản phẩm.
 * Ngăn chặn tuyệt đối việc nhảy cóc trạng thái trái phép trong cơ sở dữ liệu.
 */
export const productLifecycleMachine = setup({
  types: {
    input: {} as { status?: ProductStatus },
    context: {} as { status: ProductStatus },
    events: {} as ProductLifecycleEvent,
  },
}).createMachine({
  id: 'productLifecycle',
  context: ({ input }) => ({ status: input?.status ?? ProductStatus.DRAFT }),
  initial: ProductStatus.DRAFT,
  states: {
    [ProductStatus.DRAFT]: {
      on: {
        SUBMIT_FOR_REVIEW: ProductStatus.PENDING_REVIEW,
      },
    },
    [ProductStatus.PENDING_REVIEW]: {
      on: {
        WITHDRAW_REVIEW: ProductStatus.DRAFT,
        APPROVE: ProductStatus.ACTIVE,
        REJECT: ProductStatus.REJECTED,
      },
    },
    [ProductStatus.ACTIVE]: {
      on: {
        HIDE: ProductStatus.HIDDEN,
        HOLD: ProductStatus.HELD,
        SELL: ProductStatus.SOLD,
        SUSPEND: ProductStatus.SUSPENDED,
      },
    },
    [ProductStatus.HIDDEN]: {
      on: {
        UNHIDE: ProductStatus.ACTIVE,
        SUSPEND: ProductStatus.SUSPENDED,
      },
    },
    [ProductStatus.HELD]: {
      on: {
        RELEASE_HOLD: ProductStatus.ACTIVE,
        SELL: ProductStatus.SOLD,
      },
    },
    [ProductStatus.SOLD]: {
      type: 'final',
    },
    [ProductStatus.REJECTED]: {
      on: {
        SUBMIT_FOR_REVIEW: ProductStatus.PENDING_REVIEW,
      },
    },
    [ProductStatus.SUSPENDED]: {
      on: {
        SUBMIT_FOR_REVIEW: ProductStatus.PENDING_REVIEW,
      },
    },
  },
});

/**
 * Kiểm tra xem trạng thái sản phẩm hiện tại có cho phép thực hiện sự kiện này không.
 */
export function canTransitionProductStatus(
  currentStatus: ProductStatus,
  event: ProductLifecycleEvent,
): boolean {
  return getNextProductStatus(currentStatus, event) !== null;
}

/**
 * Tính toán trạng thái tiếp theo của sản phẩm thông qua máy trạng thái XState.
 * Trả về null nếu bước chuyển đổi trạng thái không hợp lệ.
 */
export function getNextProductStatus(
  currentStatus: ProductStatus,
  event: ProductLifecycleEvent,
): ProductStatus | null {
  const actor = createActor(productLifecycleMachine, {
    snapshot: productLifecycleMachine.resolveState({
      value: currentStatus,
      context: { status: currentStatus },
    }),
    input: { status: currentStatus },
  });
  actor.start();
  actor.send(event);
  const nextState = actor.getSnapshot().value as ProductStatus;
  actor.stop();

  return nextState !== currentStatus ? nextState : null;
}
