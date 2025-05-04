import { prisma } from "../../../database.js";
import { uploadPayments } from "../../../uploadPhotos/uploads.js";
// import { mensajeCliente, transporter } from "../mailer.js"; // Comentado si no se usa envío de correo

/**
 * Parsea la cadena detalleCurva en un array de objetos {size, qty}.
 * @param {string} detalle - La cadena detalleCurva (ej: "1/37, 2/38, ...")
 * @return {Array<{size: number, qty: number}>} Array de objetos de talla y cantidad.
 */
function parseDetalleCurva(detalle) {
  // Ejemplo: "1/37, 2/38, 3/39, 2/40, 2/41, 1/42, 1/43"
  if (!detalle) return [];
  try {
    return detalle.split(",").map((part) => {
      const [qtyStr, sizeStr] = part.trim().split("/");
      const qty = parseInt(qtyStr, 10);
      const size = parseInt(sizeStr, 10);
      if (isNaN(qty) || isNaN(size) || qty < 0) {
        throw new Error(`Formato inválido en detalleCurva: ${part.trim()}`);
      }
      return { size, qty };
    });
  } catch (e) {
    console.error("Error parsing detalleCurva:", detalle, e);
    throw new Error("Formato inválido en detalleCurva.");
  }
}

export const create = async (req, res, next) => {
  const { body = {}, decoded = {} } = req;
  const { id: userId } = decoded;
  const { items = [], total, state, comments } = body; // 'total' se usará solo para órdenes normales

  // Detectar si es una orden de curva basado en la estructura del primer item
  const isCurveOrder = items.length > 0 && items[0].detalleCurva !== undefined;
  const orderType = isCurveOrder ? "Curva" : "Normal";

  let calculatedTotal = 0;
  const allRequiredStockChecks = []; // { modelId, size, requiredQuantity, modelName }
  const allOrderItemsDataForCreate = []; // Datos para createMany después de obtener orderId

  try {
    // --- Pre-validación y preparación ---
    if (isCurveOrder) {
      console.log("Orden de Curva detectada.");
      // Lógica para órdenes de Curva
      for (const curveItem of items) {
        if (
          !curveItem.id ||
          !curveItem.detalleCurva ||
          curveItem.precioCurva === undefined ||
          curveItem.quantity === undefined
        ) {
          throw new Error(
            "Cada item de curva debe tener id (modelId), detalleCurva, precioCurva y quantity."
          );
        }
        calculatedTotal += curveItem.precioCurva * curveItem.quantity;
        const pairs = parseDetalleCurva(curveItem.detalleCurva);

        for (const pair of pairs) {
          const finalQuantity = pair.qty * curveItem.quantity;
          if (finalQuantity <= 0) continue; // Ignorar si la cantidad resultante es 0 o negativa

          allRequiredStockChecks.push({
            modelId: curveItem.id, // Asumiendo que 'id' en el item de curva es modelId
            size: pair.size,
            requiredQuantity: finalQuantity,
            modelName: curveItem.name || curveItem.id, // Usar nombre si está disponible
          });
        }
      }
    } else {
      // Lógica para órdenes Normales (existente, pero con validación unificada)
      if (total === undefined) {
        throw new Error("El campo 'total' es requerido para órdenes normales.");
      }
      calculatedTotal = total;
      for (const item of items) {
        if (
          !item.modelId ||
          item.size === undefined ||
          item.quantity === undefined
        ) {
          throw new Error(
            "Cada item normal debe tener modelId, size y quantity."
          );
        }
        if (item.quantity <= 0) continue; // Ignorar cantidades no positivas
        // Se necesitará buscar el nombre del modelo para mensajes de error claros si falla la validación
        allRequiredStockChecks.push({
          modelId: item.modelId,
          size: item.size,
          requiredQuantity: item.quantity,
          modelName: null, // Se buscará si es necesario en la validación
        });
      }
    }

    // --- Validación de Stock (ANTES de la transacción) ---
    await Promise.all(
      allRequiredStockChecks.map(async (check) => {
        const stock = await prisma.stock.findFirst({
          where: {
            modelId: check.modelId,
            size: check.size,
          },
        });

        if (!stock) {
          // Intentar obtener el nombre del modelo si no lo tenemos
          let modelName = check.modelName; // Podría ser null para orden normal
          if (!modelName) {
            const model = await prisma.model.findUnique({
              where: { id: check.modelId },
              select: { name: true },
            });
            modelName = model?.name || check.modelId;
            check.modelName = modelName; // <<< Actualizar aquí también
          }
          throw new Error(
            `No se encontró stock para el modelo ${modelName} talla ${check.size}`
          );
        }

        // <<< AÑADIR ESTO >>>
        // Asegurar que tenemos el nombre del modelo para mensajes de error posteriores,
        // especialmente si la validación pasa pero el decremento falla.
        if (!check.modelName) {
          const model = await prisma.model.findUnique({
            where: { id: check.modelId },
            select: { name: true },
          });
          check.modelName = model?.name || check.modelId; // Guardar en el objeto check
        }
        // <<< FIN AÑADIR >>>

        if (stock.quantity < check.requiredQuantity) {
          // Ya deberíamos tener check.modelName poblado aquí por el bloque anterior
          let modelName = check.modelName; // Usar el nombre ya obtenido
          // El bloque 'if (!modelName)' aquí es redundante si lo aseguramos antes, pero lo dejamos por seguridad.
          if (!modelName) {
            const model = await prisma.model.findUnique({
              where: { id: check.modelId },
              select: { name: true },
            });
            modelName = model?.name || check.modelId;
            check.modelName = modelName; // Asegurar actualización
          }
          throw new Error(
            `No hay suficiente stock (${stock.quantity}) para el modelo ${modelName} talla ${check.size}. Se requieren ${check.requiredQuantity}.`
          );
        }
        // No es necesario actualizar check.modelName aquí si ya se hizo antes
        // if (!check.modelName && modelName) check.modelName = modelName; // <<< ESTA LINEA YA NO ES NECESARIA
      })
    );

    // --- Transacción ---
    const orderId = await prisma.$transaction(async (transaction) => {
      // 1. Crear Order
      const order = await transaction.order.create({
        data: {
          total: calculatedTotal,
          state: state || "Creada",
          comments: comments,
          userId,
          typeOrder: orderType,
        },
        select: {
          id: true, // Solo necesitamos el ID para los items
        },
      });

      // 2. Preparar datos para OrderItem
      if (isCurveOrder) {
        for (const curveItem of items) {
          const pairs = parseDetalleCurva(curveItem.detalleCurva);
          for (const pair of pairs) {
            const finalQuantity = pair.qty * curveItem.quantity;
            if (finalQuantity > 0) {
              allOrderItemsDataForCreate.push({
                modelId: curveItem.id,
                orderId: order.id,
                size: pair.size,
                quantity: finalQuantity,
              });
            }
          }
        }
      } else {
        // Lógica para orden normal
        for (const item of items) {
          if (item.quantity > 0) {
            allOrderItemsDataForCreate.push({
              modelId: item.modelId,
              orderId: order.id,
              size: item.size,
              quantity: item.quantity,
            });
          }
        }
      }

      // 3. Crear OrderItems
      if (allOrderItemsDataForCreate.length > 0) {
        await transaction.orderItem.createMany({
          data: allOrderItemsDataForCreate,
        });
      } else {
        // Considerar si una orden sin items debe ser permitida o lanzar error
        // Si se llega aquí, significa que todas las cantidades eran 0 o negativas
        console.warn(`Orden ${order.id} creada sin items.`);
        // Podríamos lanzar un error aquí si no se permiten órdenes vacías:
        // throw new Error("La orden no contiene items válidos.");
      }

      // 4. Decrementar Stock (usando allRequiredStockChecks)
      await Promise.all(
        allRequiredStockChecks.map(async (check) => {
          // Usamos updateMany para asegurarnos de que decrementamos el stock correcto
          const updateResult = await transaction.stock.updateMany({
            where: {
              modelId: check.modelId,
              size: check.size,
              quantity: { gte: check.requiredQuantity }, // Condición para evitar saldos negativos por concurrencia
            },
            data: {
              quantity: {
                decrement: check.requiredQuantity,
              },
            },
          });

          // Si updateResult.count es 0, significa que la condición where falló (probablemente stock insuficiente apareció después de la validación inicial)
          if (updateResult.count === 0) {
            // Re-verificar stock para dar un error más preciso
            const currentStock = await transaction.stock.findFirst({
              where: { modelId: check.modelId, size: check.size },
              select: { quantity: true },
            });
            throw new Error(
              `Error al actualizar stock para ${check.modelName} talla ${
                check.size
              }. Stock actual: ${
                currentStock?.quantity ?? "No encontrado"
              }. Requerido: ${
                check.requiredQuantity
              }. Posible problema de concurrencia.`
            );
          }
        })
      );

      return order.id; // Devolver el ID de la orden creada
    });

    // --- Post-Transacción ---
    // Buscar la orden completa para la respuesta
    const finalOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        orderItems: {
          include: {
            model: true, // Incluir modelo para cada item
          },
        },
      },
    });

    // Opcional: Enviar correo (descomentar si es necesario)
    // if (finalOrder) {
    //   console.log(finalOrder);
    //   const mensaje = mensajeCliente(finalOrder);
    //   await transporter.sendMail(mensaje);
    // }

    res.status(201);
    res.json({
      data: finalOrder,
    });
  } catch (error) {
    // Capturar errores de validación o transacción
    next(error);
  }
};

export const getAll = async (req, res, next) => {
  try {
    const result = await prisma.order.findMany({
      include: {
        user: true,
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

export const getAllPreparer = async (req, res, next) => {
  try {
    const result = await prisma.order.findMany({
      where: {
        areReady: false,
      },
      include: {
        user: true,
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

export const getOrderByUser = async (req, res, next) => {
  const { params = {} } = req;
  const { userId } = params;

  try {
    const result = await prisma.order.findMany({
      where: {
        userId,
      },
      include: {
        user: true,
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

export const updatePatch = async (req, res, next) => {
  const { params = {}, body = {} } = req;
  const { id } = params;
  const { state, areReady } = body;

  try {
    const result = await prisma.order.update({
      where: {
        id,
      },
      data: {
        state,
        areReady,
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

  // Tener en cuenta que se debe devolver el stock

  try {
    // busco la orde

    const order = await prisma.order.findUnique({
      where: {
        id,
      },
      include: {
        orderItems: {
          include: {
            model: true,
          },
        },
      },
    });

    if (order === null) {
      throw new Error("Order not found");
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.orderItem.deleteMany({
        where: {
          orderId: id,
        },
      });

      await transaction.order.delete({
        where: {
          id,
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

    return res.status(200).json({ message: "Order deleted successfully" });
  } catch (error) {
    next(error);
  }
};

export const updateOrderItem = async (req, res, next) => {
  // eliminar un item de la orden segun el id del item y devolver las cantidades al stock
  const { body } = req; // Se requiere req.body para obtener los datos
  const { orderId, itemId, potentialNewTotal } = body;

  try {
    const order = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: {
        orderItems: {
          include: {
            model: true,
          },
        },
      },
    });

    if (order === null) {
      throw new Error("Order not found");
    }

    const item = order.orderItems.find((item) => item.id === itemId);

    // Solo quiero eliminar de 1

    if (item === undefined) {
      throw new Error("Item not found");
    }

    await prisma.$transaction(async (transaction) => {
      // actualizo el total de la orden
      await transaction.order.update({
        where: {
          id: orderId,
        },
        data: {
          total: potentialNewTotal,
        },
      });
      await transaction.orderItem.delete({
        where: {
          id: itemId,
        },
      });

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
    });

    return res.status(200).json({ message: "Order item deleted successfully" });
  } catch (error) {
    next(error);
  }
};
