import { prisma } from "../../../database.js";
import { uploadFiles } from "../../../uploadPhotos/uploads.js";
import fs from "fs";

export const create = async (req, res, next) => {
  const { body = {} } = req;
  const files = req.files;
  const { idModel } = body;
  console.log(body);
  console.log(files);

  try {
    const promises = files.map((file) => uploadFiles(file.path));
    const resultados = await Promise.all(promises);
    const images = [];
    for (let i = 0; i < resultados.length; i++) {
      images.push({ url: resultados[i].url });
    }

    files.forEach((file) => fs.unlinkSync(file.path));

    // insertar cada una de las imagenes en la base de datos, debo hacer un ccilo de insercciones
    images.forEach(async (image) => {
      await prisma.image.create({
        data: {
          modelId: idModel,
          url: image.url,
        },
      });
    });

    res.status(201);
    res.json({
      data: images,
    });
  } catch (error) {
    next(error);
  }
};

export const getAll = async (req, res, next) => {
  try {
    const result = await prisma.image.findMany({
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
    const result = await prisma.image.findUnique({
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
    const result = await prisma.image.update({
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
    await prisma.image.delete({
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
