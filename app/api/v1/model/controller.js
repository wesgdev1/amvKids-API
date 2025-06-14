import { prisma } from "../../../database.js";
import { uploadFiles } from "../../../uploadPhotos/uploads.js";
import fs from "fs";

export const create = async (req, res, next) => {
  const { body = {} } = req;
  const newBody = {
    ...body,
    price: parseInt(body.price),
    basePrice: parseInt(body.basePrice),
    normalPrice: parseInt(body.normalPrice),
    alliancePrice: parseInt(body.alliancePrice),
    reference: parseInt(body.reference),
    isPromoted: body.isPromoted === "true" ? true : false,
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

export const update = async (req, res, next) => {
  const { body = {}, params = {} } = req;
  let newBody = {
    ...body,
    price: parseInt(body.price),
    normalPrice: parseInt(body.normalPrice),
    alliancePrice: parseInt(body.alliancePrice),
    reference: parseInt(body.reference),
    basePrice: parseInt(body.basePrice),
    isPromoted: body.isPromoted === "true" ? true : false,
    pricePromoted: parseInt(body.pricePromoted),
  };
  console.log(newBody);

  const files = req.files;
  console.log(files);
  try {
    if (files?.length > 0) {
      const promises = files.map((file) => uploadFiles(file.path));
      const resultados = await Promise.all(promises);
      const images = [];

      for (let i = 0; i < resultados.length; i++) {
        images.push({ url: resultados[i].url });
      }

      files.forEach((file) => fs.unlinkSync(file.path));

      newBody = { ...newBody, images: { deleteMany: {}, create: images } };
    }

    const result = await prisma.model.update({
      where: {
        id: params.id,
      },
      data: {
        ...newBody,
        updatedAt: new Date().toISOString(),
      },
    });

    res.status(201);
    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const updateText = async (req, res, next) => {
  const { params = {}, body = {} } = req;
  const { id } = params;

  try {
    const user = await prisma.model.update({
      where: {
        id,
      },
      data: body,
    });

    res.status(200).json({
      data: user,
      message: "Model updated successfully",
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

export const getAllNamesModelsWithColor = async (req, res, next) => {
  try {
    const result = await prisma.model.findMany({
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        color: true,
      },
    });

    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// controlador para obtener los modelos con propiedad isRecommended = true
export const getRecommended = async (req, res, next) => {
  try {
    const result = await prisma.model.findMany({
      where: {
        isRecommended: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        images: true,
      },
    });
    res.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// Esta funcion se encargara de crear curvas de modelos, es decir, por cada modelo busca que haya
// 1 zapato de cada talla,si no existe, no crea la curva, porque no hay stock
// debe existir por ejemplo 1 unidad de cada talla para que se pueda crear la curva
// las tallas son solo para ejemplo: 21 22 y 41, solo para probar
export const getAllCurvas = async (req, res, next) => {
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

      // en el where se busca que haya al menos 1 unidad de las tallas 21, 22 y 41
      where: {
        AND: [
          { stocks: { some: { size: 30, quantity: { gte: 1 } } } },
          { stocks: { some: { size: 45, quantity: { gte: 1 } } } },
          // { stocks: { some: { size: 41, quantity: { gte: 1 } } } },
        ],
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
  console.log("ando por aqui");

  try {
    const result = await prisma.model.findUnique({
      where: {
        id: params.id,
      },

      include: {
        stocks: {
          orderBy: {
            size: "asc",
          },
        },
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
  const { decoded = {} } = req;

  const { tipoUsuario } = decoded;

  // aqui voy a organizar enviando el precio que quiero que me apareza segun el tipo de Usuario
  // necesito modificar la data

  const { data } = req;

  if (tipoUsuario === "Reventa") {
    const { price, ...resto } = data;
    req.data = { ...resto, price };
  } else if (tipoUsuario === "Tienda Aliada") {
    const { alliancePrice, ...resto } = data;
    req.data = { ...resto, price: alliancePrice };
  } else if (tipoUsuario === "Cliente") {
    const { normalPrice, ...resto } = data;
    req.data = { ...resto, price: normalPrice };
  }
  //  else {
  //   const { normalPrice, ...resto } = data;
  //   req.data = { ...resto, price: normalPrice };
  // }  // lo comentare, pero no se

  res.json({ data: req.data });
};

// export const update = async (req, res, next) => {
//   // const { params = {}, body = {} } = req;
//   // const { id } = params;

//   // try {
//   //   const result = await prisma.model.update({
//   //     where: {
//   //       id,
//   //     },
//   //     data: { ...body, updatedAt: new Date().toISOString() },
//   //   });

//   //   res.json({ data: result });
//   // } catch (error) {
//   //   next(error);
//   // }
// };

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

export const search = async (req, res, next) => {
  const { params } = req;
  const { searchTerm } = params;

  // separo los terminos por espacio
  const terms = searchTerm.split(" ");

  try {
    const result = await prisma.model.findMany({
      where: {
        AND: terms.map((term) => ({
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { color: { contains: term, mode: "insensitive" } },
          ],
        })),
      },
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

    // res.json({
    //   data: result,
    // });
  } catch (error) {
    next(error);
  }
};

export const searchWithFilter = async (req, res, next) => {
  const { params } = req;
  const { searchTerm } = params;
  console.log("Ingreso por la ruta de busqueda con filtro");
  console.log(searchTerm);
  console.log(req.query);

  // separo los terminos por espacio
  const terms = searchTerm.split(" ");

  const {
    filtersSize,
    filtersGenre,
    filtersBrand,
    filtersColor,
    filtersPromo,
  } = req.query;

  const sizes = filtersSize
    ? filtersSize
        .split("-")
        .map(Number)
        .filter((n) => !isNaN(n))
    : [];
  const colors = filtersColor ? filtersColor.split("-") : [];
  const brands = filtersBrand ? filtersBrand.split("-") : [];
  const genres = filtersGenre ? filtersGenre.split("-") : [];
  const promo = filtersPromo ? filtersPromo.split("-") : [];

  console.log(sizes);
  console.log(colors);
  console.log(brands);
  console.log(genres);
  console.log(promo);
  try {
    const whereClause = {
      AND: [],
    };

    // Agregar condiciones de búsqueda por términos

    if (promo.length > 0) {
      whereClause.AND.push({
        isPromoted: true,
      });
    }

    if (terms.length > 0) {
      whereClause.AND.push({
        AND: terms.map((term) => ({
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { color: { contains: term, mode: "insensitive" } },
          ],
        })),
      });
    }

    if (colors.length > 0) {
      whereClause.AND.push({
        color: {
          in: colors,
          mode: "insensitive",
        },
      });
    }

    if (brands.length > 0) {
      whereClause.AND.push({
        product: {
          name: {
            in: brands,
            mode: "insensitive",
          },
        },
      });
    }

    if (sizes.length > 0) {
      whereClause.AND.push({
        stocks: {
          some: {
            AND: [
              {
                size: {
                  in: sizes,
                },
              },
              {
                quantity: {
                  gt: 0,
                },
              },
            ],
          },
        },
      });
    }

    if (genres.length > 0) {
      const genreConditions = genres
        .map((genre) => {
          if (genre === "Hombre" || genre === "Mujer") {
            return { stocks: { some: { size: { gte: 34 } } } }; // Adultos (>=34)
          } else if (genre === "Niño" || genre === "Niña") {
            return { stocks: { some: { size: { lt: 34 } } } }; // Niños (<34)
          }
          return null;
        })
        .filter(Boolean);

      if (genreConditions.length > 0) {
        whereClause.AND.push({ OR: genreConditions });
      }
    }
    const result = await prisma.model.findMany({
      where: whereClause,
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

export const filter = async (req, res, next) => {
  console.log(" Ingreso por la ruta del filtro");

  const {
    filtersSize,
    filtersGenre,
    filtersBrand,
    filtersColor,
    filtersPromo,
  } = req.query;

  console.log(filtersBrand);
  console.log(filtersColor);
  console.log(filtersSize);
  console.log(filtersGenre);
  console.log(filtersPromo);

  const sizes = filtersSize
    ? filtersSize
        .split("-")
        .map(Number)
        .filter((n) => !isNaN(n))
    : [];
  const colors = filtersColor ? filtersColor.split("-") : [];
  const brands = filtersBrand ? filtersBrand.split("-") : [];
  const genres = filtersGenre ? filtersGenre.split("-") : [];
  const promo = filtersPromo ? filtersPromo.split("-") : [];

  console.log(sizes);
  console.log(colors);
  console.log(brands);
  console.log(genres);
  console.log(promo);

  try {
    const whereClause = {
      AND: [],
    };

    if (promo.length > 0) {
      whereClause.AND.push({
        isPromoted: true,
      });
    }

    if (colors.length > 0) {
      whereClause.AND.push({
        color: {
          in: colors,
          mode: "insensitive",
        },
      });
    }

    if (brands.length > 0) {
      whereClause.AND.push({
        product: {
          name: {
            in: brands,
            mode: "insensitive",
          },
        },
      });
    }

    if (sizes.length > 0) {
      whereClause.AND.push({
        stocks: {
          some: {
            AND: [
              {
                size: {
                  in: sizes,
                },
              },
              {
                quantity: {
                  gt: 0,
                },
              },
            ],
          },
        },
      });
    }

    if (genres.length > 0) {
      const genreConditions = genres
        .map((genre) => {
          if (genre === "Hombre" || genre === "Mujer") {
            return { stocks: { some: { size: { gte: 34 } } } }; // Adultos (>=34)
          } else if (genre === "Niño" || genre === "Niña") {
            return { stocks: { some: { size: { lt: 34 } } } }; // Niños (<34)
          }
          return null;
        })
        .filter(Boolean);

      if (genreConditions.length > 0) {
        whereClause.AND.push({ OR: genreConditions });
      }
    }
    const result = await prisma.model.findMany({
      where: whereClause,
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

export const countModels = async (req, res, next) => {
  try {
    const count = await prisma.model.count({
      where: {
        isActive: true,
      },
    });
    res.json({ data: count });
  } catch (error) {
    next(error);
  }
};

export const modelInfo = async (req, res, next) => {
  const { params = {} } = req;
  console.log("ando por aqui sin auth");

  try {
    const result = await prisma.model.findUnique({
      where: {
        id: params.id,
      },

      include: {
        stocks: {
          orderBy: {
            size: "asc",
          },
        },
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

      res.json({ data: req.data });
    }
  } catch (error) {
    next(error);
  }
};

export const getLowStock = async (req, res, next) => {
  try {
    const result = await prisma.model.findMany({
      where: {
        stocks: {
          some: {
            quantity: {
              lte: 1, // Menor o igual a 1 (incluye 0 y 1)
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        stocks: {
          where: {
            quantity: {
              lte: 1, // Solo incluir stocks con cantidad <= 1
            },
          },
          orderBy: {
            size: "asc",
          },
        },
        images: true,
        product: true,
      },
    });

    // Agregar información adicional como total de stocks bajos
    const resultWithLowStockInfo = result.map((item) => {
      const lowStockCount = item.stocks.length; // Cantidad de tallas con stock bajo
      const totalLowStockQuantity = item.stocks.reduce(
        (acc, stock) => acc + stock.quantity,
        0
      );

      return {
        ...item,
        lowStockCount, // Número de tallas con stock bajo
        totalLowStockQuantity, // Suma total de cantidades bajas
      };
    });

    res.json({
      data: resultWithLowStockInfo,
      totalModelsWithLowStock: result.length,
    });
  } catch (error) {
    next(error);
  }
};
