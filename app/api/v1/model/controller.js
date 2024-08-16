import { prisma } from "../../../database.js";
import { uploadFiles } from "../../../uploadPhotos/uploads.js";
import fs from "fs";

export const create = async (req, res, next) => {
  const { body = {}, decoded = {} } = req;
  const newBody = {
    ...body,
    price: parseInt(body.price),
    reference: parseInt(body.reference),
  };

  const files = req.files;

  console.log(files);
  console.log(newBody);

  try {
    const promises = files.map((file) => uploadFiles(file.path));
    const resultados = await Promise.all(promises);
    const images = [];
    for (let i = 0; i < resultados.length; i++) {
      images.push({ url: resultados[i].url });
    }

    files.forEach((file) => fs.unlinkSync(file.path));

    const result = await prisma.model.create({
      data: { ...newBody, images: { create: images } },
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
        images: true,
        product: true,
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

      include: {
        stocks: true,
        images: true,
      },
    });

    const resultWithTotalStocks = {
      ...result,
      totalStocks: result.stocks.reduce(
        (acc, stock) => acc + stock.quantity,
        0
      ),
    };

    if (result === null) {
      next({ message: "Model not found", status: 404 });
    } else {
      req.data = resultWithTotalStocks;

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
