import { prisma } from "../../../database.js";

export const create = async (req, res, next) => {
  const { body = {} } = req;

  try {
    const result = await prisma.direction.create({
      data: {
        userId: body.userId,
        name: "desdeSesion",
        ...body,
        createdAt: new Date().toISOString(),
      },
    });

    res.status(201);
    res.json({
      data: result,
      message: "Direction created successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const getAll = async (req, res, next) => {
  try {
    const result = await prisma.direction.findMany({
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
    const result = await prisma.direction.findUnique({
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
    const result = await prisma.direction.update({
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
    await prisma.direction.delete({
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
