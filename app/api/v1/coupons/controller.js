import { prisma } from "../../../database.js";

export const create = async (req, res, next) => {
  const { body = {} } = req;

  try {
    const result = await prisma.coupon.create({
      data: {
        ...body,
        createdAt: new Date().toISOString(),
      },
    });

    res.status(201);
    res.json({
      data: result,
      message: "Coupon created successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const getAll = async (req, res, next) => {
  try {
    const result = await prisma.coupon.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        influencer: true,
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
    const result = await prisma.coupon.findUnique({
      where: {
        id: params.id,
      },
      include: {
        orders: true,
        influencer: true,
      },
    });

    if (result === null) {
      next({ message: "Coupon not found", status: 404 });
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
    const result = await prisma.coupon.update({
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

export const remove = async (req, res, next) => {
  const { params = {} } = req;
  const { id } = params;

  try {
    await prisma.coupon.delete({
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
