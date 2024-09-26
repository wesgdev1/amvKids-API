import cron from "node-cron";
import { prisma } from "./database.js";

// Schedule the task to run at 8 PM every day
cron.schedule("2 16 * * *", async () => {
  try {
    console.log('Running scheduled task to delete orders with status "creada"');

    const orders = await prisma.order.findMany({
      where: {
        state: "Creada",
      },
      include: {
        orderItems: {
          include: {
            model: true,
          },
        },
      },
    });

    if (orders === null) {
      throw new Error("Orders not found");
    }
    await Promise.all(
      orders.map(async (order) => {
        await prisma.$transaction(async (transaction) => {
          await transaction.orderItem.deleteMany({
            where: {
              orderId: order.id,
            },
          });

          await transaction.order.delete({
            where: {
              id: order.id,
            },
          });

          await Promise.all(
            order.orderItems.map(async (item) => {
              const stock = await transaction.stock.findFirst({
                where: {
                  modelId: item.modelId,
                  size: item.size,
                },
              });

              if (stock === null) {
                throw new Error("Stock not found");
              }

              await transaction.stock.update({
                where: {
                  id: stock.id,
                },
                data: {
                  quantity: {
                    increment: item.quantity,
                  },
                },
              });
            })
          );
        });
      })
    );

    console.log('Successfully deleted orders with status "creada"');
  } catch (error) {
    console.error('Error deleting orders with status "creada":', error);
  }
});
