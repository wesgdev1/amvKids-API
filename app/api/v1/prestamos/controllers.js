import { prisma } from "../../../database.js";

const TIPO_TIENDA_ALIADA = "Tienda Aliada";

const httpError = (message, status) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

// Campos del usuario (tienda aliada) que se exponen, sin password
const userSelect = {
  id: true,
  name: true,
  email: true,
  celular: true,
  tipoUsuario: true,
  codigo: true,
};

const prestamoInclude = {
  user: { select: userSelect },
  items: {
    orderBy: { createdAt: "asc" },
    include: {
      model: {
        select: {
          id: true,
          name: true,
          color: true,
          reference: true,
          images: { where: { isPrimary: true }, take: 1 },
        },
      },
    },
  },
};

/**
 * Agrega contadores de pares al préstamo para facilitar la vista.
 * @param {object} prestamo
 * @return {object}
 */
const withResumen = (prestamo) => {
  const items = prestamo.items || [];
  const devueltos = items.filter((item) => item.devuelto).length;
  return {
    ...prestamo,
    resumen: {
      totalPares: items.length,
      devueltos,
      pendientes: items.length - devueltos,
    },
  };
};

/**
 * Recalcula el estado del préstamo según sus items:
 * Activo si hay al menos un par sin devolver, Cerrado si todos fueron devueltos.
 * @param {object} tx Cliente prisma (o transacción)
 * @param {string} prestamoId
 * @return {Promise<object>}
 */
const recalcularEstado = async (tx, prestamoId) => {
  const pendientes = await tx.prestamoItem.count({
    where: { prestamoId, devuelto: false },
  });
  const total = await tx.prestamoItem.count({ where: { prestamoId } });

  const cerrado = total > 0 && pendientes === 0;

  return tx.prestamo.update({
    where: { id: prestamoId },
    data: {
      state: cerrado ? "Cerrado" : "Activo",
      fechaCierre: cerrado ? new Date().toISOString() : null,
    },
  });
};

/**
 * Convierte los items del body en filas de PrestamoItem (una fila por par).
 * Cada item: { modelId, size, color?, modelName?, quantity?, comments? }
 * @param {Array} items
 * @return {Promise<Array>}
 */
const buildItemsData = async (items = []) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw httpError("Debe agregar al menos un modelo al préstamo", 400);
  }

  const modelIds = [...new Set(items.map((item) => item.modelId))];
  if (modelIds.some((modelId) => !modelId)) {
    throw httpError("Cada item debe tener modelId", 400);
  }

  const models = await prisma.model.findMany({
    where: { id: { in: modelIds } },
    select: { id: true, name: true, color: true },
  });
  const modelsById = new Map(models.map((model) => [model.id, model]));

  const rows = [];
  for (const item of items) {
    const model = modelsById.get(item.modelId);
    if (!model) {
      throw httpError(`Modelo ${item.modelId} no encontrado`, 404);
    }

    const size = parseInt(item.size, 10);
    if (isNaN(size)) {
      throw httpError(`Talla inválida para el modelo ${model.name}`, 400);
    }

    const quantity = item.quantity === undefined ? 1 : parseInt(item.quantity, 10);
    if (isNaN(quantity) || quantity <= 0) {
      throw httpError(`Cantidad inválida para el modelo ${model.name}`, 400);
    }

    // Cada par es una fila para poder marcar la devolución individualmente
    for (let i = 0; i < quantity; i++) {
      rows.push({
        modelId: model.id,
        size,
        modelName: item.modelName || model.name,
        color: item.color || model.color,
        comments: item.comments || null,
      });
    }
  }

  return rows;
};

// Listado de tiendas aliadas para el formulario de creación
export const getTiendasAliadas = async (req, res, next) => {
  try {
    const result = await prisma.user.findMany({
      where: { tipoUsuario: TIPO_TIENDA_ALIADA, state: true },
      select: userSelect,
      orderBy: { name: "asc" },
    });

    res.json({ data: result });
  } catch (error) {
    next(error);
  }
};

export const create = async (req, res, next) => {
  const { body = {} } = req;
  const { userId, fechaPrestamo, comments, items } = body;

  try {
    if (!userId) {
      return next({ message: "Debe seleccionar una tienda aliada", status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tipoUsuario: true },
    });

    if (!user) {
      return next({ message: "Tienda aliada no encontrada", status: 404 });
    }
    if (user.tipoUsuario !== TIPO_TIENDA_ALIADA) {
      return next({
        message: "El usuario seleccionado no es una tienda aliada",
        status: 400,
      });
    }

    const itemsData = await buildItemsData(items);

    const result = await prisma.prestamo.create({
      data: {
        userId,
        comments,
        state: "Activo",
        fechaPrestamo: fechaPrestamo
          ? new Date(fechaPrestamo).toISOString()
          : new Date().toISOString(),
        createdAt: new Date().toISOString(),
        items: { create: itemsData },
      },
      include: prestamoInclude,
    });

    res.status(201);
    res.json({
      data: withResumen(result),
      message: "Préstamo creado correctamente",
    });
  } catch (error) {
    next(error);
  }
};

export const getAll = async (req, res, next) => {
  const { query = {} } = req;
  const { state, userId } = query;

  const where = {};
  if (state) where.state = state;
  if (userId) where.userId = userId;

  try {
    const result = await prisma.prestamo.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      include: prestamoInclude,
    });

    res.json({
      data: result.map(withResumen),
    });
  } catch (error) {
    next(error);
  }
};

export const id = async (req, res, next) => {
  const { params = {} } = req;

  try {
    const result = await prisma.prestamo.findUnique({
      where: {
        id: params.id,
      },
      include: prestamoInclude,
    });

    if (result === null) {
      next({ message: "Préstamo no encontrado", status: 404 });
    } else {
      req.data = result;

      next();
    }
  } catch (error) {
    next(error);
  }
};

export const read = async (req, res, next) => {
  res.json({ data: withResumen(req.data) });
};

// Solo actualiza datos generales; los items se gestionan con sus propios endpoints
export const update = async (req, res, next) => {
  const { params = {}, body = {} } = req;
  const { id } = params;
  const { comments, fechaPrestamo, userId } = body;

  const data = { updatedAt: new Date().toISOString() };
  if (comments !== undefined) data.comments = comments;
  if (fechaPrestamo) data.fechaPrestamo = new Date(fechaPrestamo).toISOString();
  if (userId) data.userId = userId;

  try {
    const result = await prisma.prestamo.update({
      where: {
        id,
      },
      data,
      include: prestamoInclude,
    });

    res.json({ data: withResumen(result) });
  } catch (error) {
    next(error);
  }
};

// Agrega más pares a un préstamo existente
export const addItems = async (req, res, next) => {
  const { params = {}, body = {} } = req;
  const { id } = params;

  try {
    const itemsData = await buildItemsData(body.items);

    const result = await prisma.$transaction(async (tx) => {
      await tx.prestamoItem.createMany({
        data: itemsData.map((item) => ({ ...item, prestamoId: id })),
      });
      await recalcularEstado(tx, id);
      return tx.prestamo.findUnique({ where: { id }, include: prestamoInclude });
    });

    res.status(201);
    res.json({
      data: withResumen(result),
      message: "Pares agregados al préstamo",
    });
  } catch (error) {
    next(error);
  }
};

// Marca (o desmarca) un par como devuelto
export const devolverItem = async (req, res, next) => {
  const { params = {}, body = {} } = req;
  const { id, itemId } = params;
  const { devuelto = true, fechaDevolucion, comments } = body;

  try {
    const item = await prisma.prestamoItem.findFirst({
      where: { id: itemId, prestamoId: id },
    });

    if (!item) {
      return next({ message: "Par no encontrado en este préstamo", status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const data = {
        devuelto: Boolean(devuelto),
        fechaDevolucion: devuelto
          ? new Date(fechaDevolucion || Date.now()).toISOString()
          : null,
      };
      if (comments !== undefined) data.comments = comments;

      await tx.prestamoItem.update({ where: { id: itemId }, data });
      await recalcularEstado(tx, id);
      return tx.prestamo.findUnique({ where: { id }, include: prestamoInclude });
    });

    res.json({
      data: withResumen(result),
      message: devuelto ? "Par marcado como devuelto" : "Par marcado como pendiente",
    });
  } catch (error) {
    next(error);
  }
};

// Marca todos los pares pendientes como devueltos y cierra el préstamo
export const devolverTodos = async (req, res, next) => {
  const { params = {}, body = {} } = req;
  const { id } = params;
  const { fechaDevolucion } = body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.prestamoItem.updateMany({
        where: { prestamoId: id, devuelto: false },
        data: {
          devuelto: true,
          fechaDevolucion: new Date(fechaDevolucion || Date.now()).toISOString(),
        },
      });
      await recalcularEstado(tx, id);
      return tx.prestamo.findUnique({ where: { id }, include: prestamoInclude });
    });

    res.json({
      data: withResumen(result),
      message: "Todos los pares fueron marcados como devueltos",
    });
  } catch (error) {
    next(error);
  }
};

// Elimina un par del préstamo (por ejemplo, si se registró por error)
export const removeItem = async (req, res, next) => {
  const { params = {} } = req;
  const { id, itemId } = params;

  try {
    const item = await prisma.prestamoItem.findFirst({
      where: { id: itemId, prestamoId: id },
    });

    if (!item) {
      return next({ message: "Par no encontrado en este préstamo", status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.prestamoItem.delete({ where: { id: itemId } });
      await recalcularEstado(tx, id);
      return tx.prestamo.findUnique({ where: { id }, include: prestamoInclude });
    });

    res.json({ data: withResumen(result) });
  } catch (error) {
    next(error);
  }
};

export const remove = async (req, res, next) => {
  const { params = {} } = req;
  const { id } = params;

  try {
    await prisma.$transaction([
      prisma.prestamoItem.deleteMany({ where: { prestamoId: id } }),
      prisma.prestamo.delete({ where: { id } }),
    ]);
    res.status(204);
    res.end();
  } catch (error) {
    next(error);
  }
};
