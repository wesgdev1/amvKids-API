import { prisma } from "../../../database.js";
import { uploadFiles } from "../../../uploadPhotos/uploads.js";
import { signToken } from "../auth.js";
import { mensajeCliente, transporter, welcomeMessage } from "../mailer.js";
import { encryptPassword, verifyPassword } from "./model.js";
import { createUser, getAllUsers, loginUser } from "./services.js";
import fs from "fs";

export const signup = async (req, res, next) => {
  const { body } = req;
  try {
    const password = await encryptPassword(req.body.password);

    const user = await createUser(body, password);
    res.status(201).json({
      data: user,
      message: "User created successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const createUsers = async (req, res, next) => {
  console.log(req.body);
  const { body } = req;

  const passwordRamdom = Math.random().toString(36).slice(-8);

  try {
    const password = await encryptPassword(passwordRamdom);

    const user = await createUser(body, password);

    const mensaje = welcomeMessage(user, passwordRamdom);
    await transporter.sendMail(mensaje);

    res.status(201).json({
      data: user,
      message: "User created successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const signin = async (req, res, next) => {
  const { body } = req;
  const { email, password } = body;
  try {
    const user = await loginUser(email, password);
    if (user === null) {
      return next({ message: "Invalid credentials", status: 401 });
    }
    const passwordMatch = await verifyPassword(password, user.password);
    if (!passwordMatch) {
      return next({ message: "Invalid credentials", status: 401 });
    }
    const token = signToken({ id: user.id, tipoUsuario: user.tipoUsuario });
    res.status(200).json({
      data: { user, password: undefined },
      meta: { token },
      message: "User logged in successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const getAll = async (req, res, next) => {
  try {
    const users = await getAllUsers();
    res.status(200).json({
      data: users,
      message: "Users retrieved successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req, res, next) => {
  const { body = {}, decoded = {} } = req;
  const { id } = decoded;

  console.log(body);
  console.log(id);

  try {
    const user = await prisma.user.findUnique({
      where: {
        id,
      },
      select: {
        password: true,
      },
    });

    const passwordMatch = await verifyPassword(body.password, user.password);

    if (!passwordMatch) {
      return next({
        message: "La contraseña antigua no coincide, revisa la informacion",
        status: 400,
      });
    }

    const newPassword = await encryptPassword(body.newPassword);

    const result = await prisma.user.update({
      where: {
        id,
      },
      data: {
        password: newPassword,
      },
    });

    res.json({ data: result });
  } catch (error) {
    next(error);
  }
};

export const id = async (req, res, next) => {
  const { id } = req.params;
  try {
    const result = await prisma.user.findUnique({
      where: {
        id,
      },
    });
    if (!result) {
      return next({ message: "User not found", status: 404 });
    }
    req.result = result;
    next();
  } catch (error) {
    next(error);
  }
};

export const read = async (req, res, next) => {
  res.json({ data: req.result });
};

export const update = async (req, res, next) => {
  const { params = {}, body = {} } = req;
  const { id } = params;

  try {
    const user = await prisma.user.update({
      where: {
        id,
      },
      data: body,
    });

    res.status(200).json({
      data: user,
      message: "User updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const updatePhoto = async (req, res, next) => {
  const { params = {}, body = {} } = req;
  const { id } = params;
  const files = req.files;
  console.log(files);
  console.log(id);

  try {
    const promises = files.map((file) => uploadFiles(file.path));
    const resultados = await Promise.all(promises);
    const images = [];
    for (let i = 0; i < resultados.length; i++) {
      images.push({ urlFoto: resultados[i].url });
    }

    files.forEach((file) => fs.unlinkSync(file.path));

    const result = await prisma.user.update({
      where: {
        id,
      },
      data: {
        urlFoto: images[0].urlFoto,
      },
    });

    res.status(200).json({
      data: result,
      message: "User updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const myProfile = async (req, res, next) => {
  const { id } = req.body;
  try {
    const user = await prisma.user.findUnique({
      where: {
        id,
      },
    });
    if (!user) {
      return next({ message: "User not found", status: 404 });
    }
    res.status(200).json({
      data: user,
      message: "User retrieved successfully",
    });
  } catch (error) {
    next(error);
  }
};
