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
              //
              price: item.price, // Asumiendo que 'price' es un campo en el item
              normalPrice: item.normalPrice, // Asumiendo que 'normalPrice' es un campo en el item
              alliancePrice: item.alliancePrice, // Asumiendo que 'alliancePrice' es un campo en el item
              basePrice: item.basePrice, // Asumiendo que 'basePrice' es un campo en el item
              isPromoted: item.isPromoted, // Asumiendo que 'isPromoted' es un campo en el item
              pricePromoted: item.pricePromoted, // Asumiendo que 'pricePromoted' es un campo en el item
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
        // areReady: false,
        NOT: {
          state: {
            in: ["Pedido Entregado"],
          },
        },
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
  const { params = {} } = req;
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

export const updateOrderItemUnity = async (req, res, next) => {
  const { body } = req;
  const { orderId, itemId, potentialNewTotal } = body;

  try {
    if (!orderId || !itemId || potentialNewTotal === undefined) {
      return next({
        message:
          "Los parámetros 'orderId', 'itemId' y 'potentialNewTotal' son requeridos.",
        status: 400,
      });
    }

    if (typeof potentialNewTotal !== "number" || potentialNewTotal < 0) {
      return next({
        message: "'potentialNewTotal' debe ser un número no negativo.",
        status: 400,
      });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: {
          where: { id: itemId },
          include: { model: true },
        },
      },
    });

    if (!order) {
      return next({
        message: `Orden con id ${orderId} no encontrada.`,
        status: 404,
      });
    }

    const itemToUpdate = order.orderItems.find((item) => item.id === itemId);

    if (!itemToUpdate) {
      return next({
        message: `Ítem con id ${itemId} no encontrado en la orden ${orderId}.`,
        status: 404,
      });
    }

    if (itemToUpdate.quantity <= 0) {
      return next({
        message: `El ítem con id ${itemId} ya tiene cantidad 0 o menor, no se puede reducir más.`,
        status: 400,
      });
    }

    await prisma.$transaction(async (transaction) => {
      // 1. Actualizar el total de la orden
      await transaction.order.update({
        where: { id: orderId },
        data: { total: potentialNewTotal },
      });

      // 2. Actualizar o eliminar el OrderItem
      if (itemToUpdate.quantity > 1) {
        await transaction.orderItem.update({
          where: { id: itemId },
          data: { quantity: { decrement: 1 } },
        });
      } else {
        // Si la cantidad es 1, se elimina el item
        await transaction.orderItem.delete({
          where: { id: itemId },
        });
      }

      // 3. Devolver la unidad al stock
      const stock = await transaction.stock.findFirst({
        where: {
          modelId: itemToUpdate.modelId,
          size: itemToUpdate.size,
        },
      });

      if (!stock) {
        // Esto no debería pasar si el item existía en la orden, pero es una salvaguarda
        throw new Error(
          `Stock no encontrado para el modelo ${
            itemToUpdate.model?.name || itemToUpdate.modelId
          } talla ${itemToUpdate.size}. No se pudo devolver la unidad.`
        );
      }

      await transaction.stock.update({
        where: { id: stock.id },
        data: { quantity: { increment: 1 } },
      });
    });

    // Devolver la orden actualizada para confirmación (opcional)
    const updatedOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: {
          include: { model: true },
        },
        user: true,
      },
    });

    res.status(200).json({
      message: `Unidad del ítem ${itemId} actualizada/eliminada correctamente.`,
      data: updatedOrder,
    });
  } catch (error) {
    console.error("Error en updateOrderItemUnity:", error);
    next(error); // Pasa el error al manejador de errores global
  }
};

export const crearLinkDePago = async (req, res) => {
  try {
    const { total, descripcion, email, orderId } = req.body;
    console.log(total, descripcion, email, orderId); // Log para depuración

    const body = {
      amount_type: "CLOSE",
      amount: {
        currency: "COP",
        total_amount: total,
      },
      description: descripcion,
      callback_url: "https://amvkids.com.co/resultado?orderId=" + orderId,
      payment_methods: ["PSE", "CREDIT_CARD", "NEQUI"],
      payer_email: email,
      image_url: "https://robohash.org/sad.png",

      metadata: {
        orderId: orderId,
      },
    };

    const response = await fetch(
      "https://integrations.api.bold.co/online/link/v1",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `x-api-key ${process.env.BOLD_API_KEY_PRUEBA}`,
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      console.error("Error en la respuesta de Bold:", response.statusText);
      return res.status(500).json({ error: "Error al crear el link de pago" });
    } else {
      const auxres = response.clone(); // Clonamos la respuesta para poder leerla dos veces
      const aux = await auxres.json(); // Leemos el cuerpo de la respuesta clonada
      console.log(aux.payload.payment_link); // Log para depuración

      console.log("orderId:", orderId); // Log para depuración
      await prisma.order.updateMany({
        where: {
          id: orderId,
        },
        data: {
          payment_link: aux.payload.payment_link,
        },
      });
    }

    // actualizar el id del linl de pago en orders

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error al crear el link de pago:", error);
    res.status(500).json({ error: "No se pudo generar el link de pago" });
  }
};

export const webhook = async (req, res) => {
  console.log("Webhook Bold:", req.body); // Log para depuración
  try {
    const evento = req.body;
    const tipo = evento.type;
    const paymentLink = evento.data?.metadata?.reference;
    const idTransaction = evento.data?.payment_id;

    // Validar que paymentLink no sea null o undefined
    if (!paymentLink) {
      console.error(
        "❌ Error: paymentLink es null o undefined en el evento:",
        evento
      );
      return res.status(400).json({
        error: "paymentLink es requerido para procesar el webhook",
        evento: evento,
      });
    }

    if (tipo === "SALE_APPROVED") {
      console.log("✅ Pago aprobado para orden:", paymentLink);

      // Verificar si existe una orden con ese payment_link antes de actualizar
      const ordenExistente = await prisma.order.findFirst({
        where: {
          payment_link: paymentLink,
        },
      });

      if (!ordenExistente) {
        console.error(
          `❌ No se encontró orden con payment_link: ${paymentLink}`
        );
        return res.status(404).json({
          error: "No se encontró orden con el payment_link proporcionado",
          paymentLink,
        });
      }

      // Actualiza en tu base de datos como PAGADA
      await prisma.order.updateMany({
        where: {
          payment_link: paymentLink,
        },
        data: {
          pagoBold: true,
          state: "Pago Enviado",
          idTransaction: idTransaction,
        },
      });
    }

    if (tipo === "SALE_REJECTED") {
      console.log("❌ Pago rechazado para orden:", paymentLink);
      // await marcarComoRechazada(orderId);
    }

    if (tipo === "VOID_APPROVED") {
      console.log("🛑 Pago anulado para orden:", paymentLink);
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Error en webhook Bold:", err);
    res.sendStatus(500);
  }
};

export const countOrderByDate = async (req, res, next) => {
  const { body = {} } = req;
  // Esperar 'startDate' y 'endDate' como strings ISO 8601 o similar desde el frontend
  const { startDate: startDateString, endDate: endDateString } = body;

  try {
    // Validar que se proporcionen startDate y endDate
    if (!startDateString || !endDateString) {
      return next({
        message: "Los parámetros 'startDate' y 'endDate' son requeridos.",
        status: 400,
      });
    }

    // Convertir los strings de fecha a objetos Date
    const startDate = new Date(startDateString);
    const endDate = new Date(endDateString);

    // Validar si las fechas son válidas
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return next({
        message: "Formato de fecha inválido para startDate o endDate.",
        status: 400,
      });
    }

    // Log para depuración (opcional)
    console.log(
      `Recibido: StartDate: ${startDateString}, EndDate: ${endDateString}. Usando: StartDate: ${startDate.toISOString()}, EndDate: ${endDate.toISOString()}`
    );

    // Contar las órdenes en el rango calculado
    const result = await prisma.order.count({
      where: {
        state: {
          in: ["Pedido Entregado", "Pago Confirmado"],
        },
        createdAt: {
          gte: startDate, // Mayor o igual que startDate
          lte: endDate, // Menor o igual que endDate
        },
      },
    });

    // Devolver el resultado
    res.json({
      data: result,
    });
  } catch (error) {
    // Loggear el error en el servidor para diagnóstico
    console.error("Error en countOrderByDate:", error);
    // Pasar un error genérico al siguiente middleware
    next({ message: "Error al contar las órdenes por fecha.", status: 500 });
  }
};

export const sumarTotalOrdenesByDate = async (req, res, next) => {
  const { body = {} } = req;
  // Esperar 'startDate' y 'endDate' como strings ISO 8601 o similar desde el frontend
  const { startDate: startDateString, endDate: endDateString } = body;

  try {
    // Validar que se proporcionen startDate y endDate
    if (!startDateString || !endDateString) {
      return next({
        message: "Los parámetros 'startDate' y 'endDate' son requeridos.",
        status: 400,
      });
    }

    // Convertir los strings de fecha a objetos Date
    const startDate = new Date(startDateString);
    const endDate = new Date(endDateString);

    // Validar si las fechas son válidas
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return next({
        message: "Formato de fecha inválido para startDate o endDate.",
        status: 400,
      });
    }

    // Log para depuración (opcional)
    console.log(
      `Sumando totales: StartDate: ${startDate.toISOString()}, EndDate: ${endDate.toISOString()}`
    );

    // Calcular la suma del campo 'total' para las órdenes filtradas
    const result = await prisma.order.aggregate({
      _sum: {
        total: true, // Sumar el campo 'total'
      },
      where: {
        state: {
          in: ["Pedido Entregado", "Pago Confirmado"],
        },
        createdAt: {
          gte: startDate, // Mayor o igual que startDate
          lte: endDate, // Menor o igual que endDate
        },
      },
    });

    // El resultado de la agregación estará en result._sum.total
    // Si no hay órdenes que coincidan, _sum.total será null.
    const totalSum = result._sum.total || 0; // Devolver 0 si la suma es null

    // Devolver el resultado
    res.json({
      data: totalSum,
    });
  } catch (error) {
    // Loggear el error en el servidor para diagnóstico
    console.error("Error en sumarTotalOrdenesByDate:", error);
    // Pasar un error genérico al siguiente middleware
    next({
      message: "Error al sumar los totales de las órdenes por fecha.",
      status: 500,
    });
  }
};

export const sumarParesVendidosPorFecha = async (req, res, next) => {
  const { body = {} } = req;
  // Esperar 'startDate' y 'endDate' como strings ISO 8601 o similar desde el frontend
  const { startDate: startDateString, endDate: endDateString } = body;

  try {
    // Validar que se proporcionen startDate y endDate
    if (!startDateString || !endDateString) {
      return next({
        message: "Los parámetros 'startDate' y 'endDate' son requeridos.",
        status: 400,
      });
    }

    // Convertir los strings de fecha a objetos Date
    const startDate = new Date(startDateString);
    const endDate = new Date(endDateString);

    // Validar si las fechas son válidas
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return next({
        message: "Formato de fecha inválido para startDate o endDate.",
        status: 400,
      });
    }

    // Log para depuración (opcional)
    console.log(
      `Sumando pares vendidos: StartDate: ${startDate.toISOString()}, EndDate: ${endDate.toISOString()}`
    );

    // Calcular la suma de la cantidad de OrderItems para las órdenes filtradas
    const result = await prisma.orderItem.aggregate({
      _sum: {
        quantity: true, // Sumar el campo 'quantity' de OrderItem
      },
      where: {
        // Filtrar basado en la orden relacionada
        Order: {
          state: {
            in: ["Pedido Entregado", "Pago Confirmado"],
          },
          createdAt: {
            gte: startDate, // Mayor o igual que startDate
            lte: endDate, // Menor o igual que endDate
          },
        },
      },
    });

    // El resultado de la agregación estará en result._sum.quantity
    // Si no hay items que coincidan, _sum.quantity será null.
    const totalQuantity = result._sum.quantity || 0; // Devolver 0 si la suma es null

    // Devolver el resultado
    res.json({
      data: totalQuantity,
    });
  } catch (error) {
    // Loggear el error en el servidor para diagnóstico
    console.error("Error en sumarParesVendidosPorFecha:", error);
    // Pasar un error genérico al siguiente middleware
    next({
      message: "Error al sumar los pares vendidos por fecha.",
      status: 500,
    });
  }
};

export const modeloMasVendidoPorFecha = async (req, res, next) => {
  const { body = {} } = req;
  const { startDate: startDateString, endDate: endDateString } = body;

  try {
    if (!startDateString || !endDateString) {
      return next({
        message: "Los parámetros 'startDate' y 'endDate' son requeridos.",
        status: 400,
      });
    }

    const startDate = new Date(startDateString);
    const endDate = new Date(endDateString);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return next({
        message: "Formato de fecha inválido para startDate o endDate.",
        status: 400,
      });
    }

    console.log(
      `Buscando modelo más vendido: StartDate: ${startDate.toISOString()}, EndDate: ${endDate.toISOString()}`
    );

    // Agrupar por modelId y sumar las cantidades de OrderItems
    const groupedItems = await prisma.orderItem.groupBy({
      by: ["modelId"],
      _sum: {
        quantity: true,
      },
      where: {
        Order: {
          state: {
            in: ["Pedido Entregado", "Pago Confirmado"],
          },
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        // Asegurarse de que modelId no sea null para evitar errores en el join implícito o en la búsqueda posterior
        modelId: {
          not: null,
        },
      },
      orderBy: {
        _sum: {
          quantity: "desc", // Ordenar por la suma de cantidad descendente
        },
      },
      take: 1, // Tomar solo el primero (el más vendido)
    });

    if (groupedItems.length === 0 || !groupedItems[0].modelId) {
      return res.json({
        data: null, // O un mensaje como "No se encontraron modelos vendidos en este período"
        message:
          "No se encontraron modelos vendidos en el período especificado con estado 'Pedido Entregado'.",
      });
    }

    const topModelId = groupedItems[0].modelId;
    const totalQuantitySold = groupedItems[0]._sum.quantity;

    // Buscar los detalles del modelo más vendido
    const topModelDetails = await prisma.model.findUnique({
      where: {
        id: topModelId,
      },
      select: {
        id: true,
        name: true,
        color: true,
        reference: true,
        images: {
          // Opcional: tomar una imagen principal o la primera
          take: 1,
          select: {
            url: true,
          },
        },
      },
    });

    res.json({
      data: {
        ...topModelDetails,
        totalQuantitySold: totalQuantitySold,
      },
    });
  } catch (error) {
    console.error("Error en modeloMasVendidoPorFecha:", error);
    next({
      message: "Error al obtener el modelo más vendido por fecha.",
      status: 500,
    });
  }
};

export const aplicarDescuento = async (req, res, next) => {
  const { body = {} } = req;
  const { orderId, porcentajeDescuento } = body; // 'porcentajeDescuento' AHORA es el monto directo a descontar

  try {
    // Validar que los parámetros necesarios estén presentes
    if (orderId === undefined || porcentajeDescuento === undefined) {
      return next({
        message:
          "Los parámetros 'orderId' y 'porcentajeDescuento' (monto a descontar) son requeridos.",
        status: 400,
      });
    }

    const montoADescontar = Number(porcentajeDescuento);

    // Validar que 'montoADescontar' sea un número y positivo
    if (isNaN(montoADescontar) || montoADescontar <= 0) {
      return next({
        message:
          "El 'porcentajeDescuento' (monto a descontar) debe ser un número positivo.",
        status: 400,
      });
    }

    const order = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
    });

    if (!order) {
      return next({
        message: `Orden con id ${orderId} no encontrada.`,
        status: 404,
      });
    }

    // Validar que el monto a descontar no sea mayor que el total de la orden
    if (montoADescontar > order.total) {
      return next({
        message: `El monto a descontar (${montoADescontar}) no puede ser mayor que el total actual de la orden (${order.total}).`,
        status: 400,
      });
    }

    const nuevoTotal = order.total - montoADescontar;

    const updatedOrder = await prisma.order.update({
      where: {
        id: orderId,
      },
      data: {
        total: nuevoTotal,
        discount: montoADescontar, // Guardar el monto del descuento aplicado
      },
    });

    res.json({
      data: updatedOrder,
      message: `Descuento de ${montoADescontar.toFixed(
        2
      )} aplicado correctamente. Nuevo total: ${nuevoTotal.toFixed(2)}.`,
    });
  } catch (error) {
    console.error("Error en aplicarDescuento:", error);
    next({
      message: "Error al aplicar el descuento a la orden.",
      status: 500,
    });
  }
};

export const calcularUtilidad = async (req, res, next) => {
  const { body = {} } = req;
  const { startDate: startDateString, endDate: endDateString } = body;

  try {
    // --- Validación de Fechas ---
    if (!startDateString || !endDateString) {
      return next({
        message: "Los parámetros 'startDate' y 'endDate' son requeridos.",
        status: 400,
      });
    }
    const startDate = new Date(startDateString);
    const endDate = new Date(endDateString);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return next({
        message: "Formato de fecha inválido para startDate o endDate.",
        status: 400,
      });
    }
    console.log(
      `Calculando utilidad: StartDate: ${startDate.toISOString()}, EndDate: ${endDate.toISOString()}`
    );

    // --- Obtener Órdenes Relevantes ---
    const ordenes = await prisma.order.findMany({
      where: {
        state: {
          in: ["Pedido Entregado", "Pago Confirmado"],
        },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        user: {
          // Incluir usuario para obtener tipoUsuario
          select: { tipoUsuario: true },
        },
        orderItems: {
          // Incluir items de la orden
          include: {
            model: true, // Incluir modelo para acceder a precios/basePrice si es necesario
          },
        },
      },
    });

    let utilidadBrutaTotal = 0;
    let totalDescuentosAplicados = 0;
    let itemsProcesados = 0;

    // --- Calcular Utilidad por Item y Sumar Descuentos ---
    for (const order of ordenes) {
      totalDescuentosAplicados += order.discount || 0; // Sumar descuento de la orden si existe

      for (const orderItem of order.orderItems) {
        itemsProcesados++;
        let utilidadItem = 0;
        // Determinar el precio base (prioridad: item, luego modelo, default 0)
        const basePriceItem =
          orderItem.basePrice ?? orderItem.model?.basePrice ?? 0;
        let precioVenta = null;

        // Caso 1: Item en promoción
        if (orderItem.isPromoted === true) {
          precioVenta = orderItem.pricePromoted ?? 0; // Usar precio promocional (default 0 si es null)
        }
        // Caso 2: Precio específico en el item (y no en promoción)
        else if (orderItem.price !== null) {
          precioVenta = orderItem.price;
        }
        // Caso 3: Precio basado en tipo de usuario y modelo (si no hay precio específico en item y no está en promo)
        else {
          const tipoUsuario = order.user?.tipoUsuario;
          const model = orderItem.model;
          if (model) {
            // Asegurarse que el modelo está cargado
            switch (tipoUsuario) {
              case "Cliente":
                precioVenta = model.normalPrice;
                break;
              case "Reventa":
                precioVenta = model.price;
                break;
              case "Tienda Aliada":
                precioVenta = model.alliancePrice;
                break;
              default:
                // Si tipoUsuario es null o no coincide, no se puede determinar el precio
                console.warn(
                  `No se pudo determinar precio de venta para item ${orderItem.id} (Tipo Usuario: ${tipoUsuario})`
                );
                precioVenta = null;
            }
            if (precioVenta === null && tipoUsuario) {
              console.warn(
                `El precio correspondiente (${tipoUsuario}) en el modelo ${model.id} es null.`
              );
            }
          } else {
            console.warn(`Modelo no encontrado para orderItem ${orderItem.id}`);
            precioVenta = null;
          }
        }

        // Calcular utilidad solo si se determinó un precio de venta
        if (precioVenta !== null) {
          utilidadItem = precioVenta - basePriceItem;
        } else {
          console.warn(
            `Precio de venta final es null para item ${orderItem.id}, utilidad considerada 0.`
          );
          utilidadItem = 0; // No se pudo calcular, utilidad es 0 para este item
        }

        utilidadBrutaTotal += utilidadItem * orderItem.quantity; // Multiplicar por la cantidad del item
      }
    }

    // --- Calcular Utilidad Neta ---
    const utilidadNetaTotal = utilidadBrutaTotal - totalDescuentosAplicados;

    // --- Devolver Resultado ---
    res.json({
      data: {
        utilidadNetaTotal,
        utilidadBrutaTotal,
        totalDescuentosAplicados,
        ordenesConsideradas: ordenes.length,
        itemsProcesados,
        rangoFechas: {
          inicio: startDate.toISOString(),
          fin: endDate.toISOString(),
        },
      },
    });
  } catch (error) {
    console.error("Error en calcularUtilidad:", error);
    next({
      message: "Error al calcular la utilidad por fecha.",
      status: 500,
    });
  }
};
