import { prisma } from "../../../database.js";

export const create = async (req, res, next) => {
  const { body = {} } = req;

  try {
    const result = await prisma.stock.create({
      data: { ...body },
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
    const result = await prisma.stock.findMany({
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
    const result = await prisma.stock.findUnique({
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
  const { quantity: quantityToAdd, ...restOfBody } = body;

  try {
    const currentStock = await prisma.stock.findUnique({
      where: { id },
    });

    if (!currentStock) {
      return next({ message: "Stock item not found", status: 404 });
    }

    const newQuantity = currentStock.quantity + (Number(quantityToAdd) || 0);

    const result = await prisma.stock.update({
      where: {
        id,
      },
      data: {
        ...restOfBody,
        quantity: newQuantity,
        updatedAt: new Date().toISOString(),
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

export const countQuantityforTotalStock = async (req, res, next) => {
  try {
    const result = await prisma.stock.aggregate({
      _sum: {
        quantity: true,
      },
    });

    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
