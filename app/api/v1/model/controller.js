import { prisma } from "../../../database.js";

export const create = async (req, res, next) => {
  const { body = {}, decoded = {} } = req;

  try {
    const result = await prisma.model.create({
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
    const result = await prisma.model.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        stocks: true,
      },
    });
    const resultWithTotalStocks = result.map((item) => {
      const totalStocks = item.stocks.reduce(
        (acc, stock) => acc + stock.quantity,
        0
      );
      return {
        ...item,
        totalStocks, // Agregar la suma total de stocks como una nueva propiedad
      };
    });

    res.json({
      data: resultWithTotalStocks,
    });
  } catch (error) {
    next(error);
  }
};

export const id = async (req, res, next) => {
  const { params = {} } = req;

  try {
    const result = await prisma.model.findUnique({
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
    const result = await prisma.model.update({
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
    await prisma.model.delete({
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
