import { prisma } from "../../../database.js";

export const create = async (req, res, next) => {
  const { body = {}, decoded = {} } = req;
  const { id: userId } = decoded;
  const { items = [], total, state, comments } = body;

  try {
    await Promise.all(
      items.map(async (item) => {
        const stock = await prisma.stock.findFirst({
          where: {
            modelId: item.modelId,
            size: item.size,
          },
        });

        if (stock === null) {
          throw new Error("Stock no encontrado");
        }

        if (stock.quantity < item.quantity) {
          throw new Error("No hay suficiente stock");
        }
      })
    );

    const result = await prisma.$transaction(async (transaction) => {
      const order = await transaction.order.create({
        data: {
          total: total,
          state: state,
          comments: comments,
          userId,
        },
      });

      const itemsWithOrderId = items.map((item) => ({
        ...item,
        orderId: order.id,
      }));

      await transaction.orderItem.createMany({
        data: itemsWithOrderId,
      });

      await Promise.all(
        items.map(async (item) => {
          const stock = await transaction.stock.findFirst({
            where: {
              modelId: item.modelId,
              size: item.size,
            },
          });

          if (stock === null) {
            throw new Error("Stock no encontrado");
          }

          await transaction.stock.update({
            where: {
              id: stock.id,
            },
            data: {
              quantity: {
                decrement: item.quantity,
              },
            },
          });
        })
      );

      return order;
    });

    res.status(201);
    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getAll = async (req, res, next) => {
  try {
    const result = await prisma.order.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const id = async (req, res, next) => {
  const { params = {} } = req;

  try {
    const result = await prisma.order.findUnique({
      where: {
        id: params.id,
      },
    });

    if (result === null) {
      next({ message: "Model not found", status: 404 });
    } else {
      req.data = result;

      next();
    }
  } catch (error) {
    next(error);
  }
};

export const read = async (req, res, next) => {
  res.json({ data: req.data });
};

export const update = async (req, res, next) => {
  const { params = {}, body = {} } = req;
  const { id } = params;

  try {
    const result = await prisma.stock.update({
      where: {
        id,
      },
      data: { ...body, updatedAt: new Date().toISOString() },
    });

    res.json({ data: result });
  } catch (error) {
    next(error);
  }
};

export const remove = async (req, res, error) => {
  const { params = {} } = req;
  const { id } = params;

  try {
    await prisma.stock.delete({
      where: {
        id,
      },
    });
    res.status(204);
    res.end();
  } catch (error) {
    next(error);
  }
};
