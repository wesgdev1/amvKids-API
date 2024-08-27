import { prisma } from "../../../database.js";
import { uploadFiles, uploadPayments } from "../../../uploadPhotos/uploads.js";
import { mensajeCliente, transporter } from "../mailer.js";

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
        include: {
          user: true,
          orderItems: {
            include: {
              model: true,
            },
          },
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

    if (result) {
      // Busco la orden

      const orderUpdate = await prisma.order.findUnique({
        where: {
          id: result.id,
        },
        include: {
          user: true,
          orderItems: {
            include: {
              model: true,
            },
          },
        },
      });

      console.log(orderUpdate);

      // Enviar correo
      const mensaje = mensajeCliente(orderUpdate);
      await transporter.sendMail(mensaje);
    }

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

export const getMyOrders = async (req, res, next) => {
  const { decoded = {} } = req;
  const { id: userId } = decoded;

  try {
    const result = await prisma.order.findMany({
      where: {
        userId,
      },
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
      include: {
        orderItems: {
          include: {
            model: true,
          },
        },
        user: true,
      },
    });

    if (result === null) {
      next({ message: "Order not found", status: 404 });
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
  const files = req.files;
  console.log(files);

  try {
    const promises = files.map((file) => uploadPayments(file.path));
    const resultados = await Promise.all(promises);

    const result = await prisma.order.update({
      where: {
        id,
      },
      data: {
        paymentUrl: resultados[0].url,
        updatedAt: new Date().toISOString(),
        state: "Pago Enviado",
      },
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
