import { prisma } from "../../../database.js";

export const create = async (req, res, next) => {
  const { body = {}, decoded = {} } = req;
  const { items = [] } = body;

  try {
    // hago uns transaccion para crear el order y el orderItem y actualizo el stock
    const result = await prisma.$transaction([
      prisma.order.create({
        data: {
          ...body,
        },
      }),
      ...items.map((item) =>
        prisma.orderItem.create({
          data: {
            ...item,
          },
        })
      ),

      ...items.map((item) =>
        prisma.stock.update({
          where: {
            productId: item.productId,
          },
          data: {
            quantity: {
              decrement: item.quantity,
            },
          },
        })
      ),
    ]);

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
