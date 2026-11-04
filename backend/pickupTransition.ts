import type { Prisma } from '@prisma/client';

type OrderUpdater = {
  updateMany: (args: {
    where: { id: number; stage: string };
    data: Prisma.ordersUpdateManyMutationInput;
  }) => Promise<{ count: number }>;
};

export async function claimPickupTransition(
  orders: OrderUpdater,
  order: { id: number; stage: string },
  data: Prisma.ordersUpdateManyMutationInput
): Promise<boolean> {
  const result = await orders.updateMany({ where: { id: order.id, stage: order.stage }, data });
  return result.count === 1;
}
