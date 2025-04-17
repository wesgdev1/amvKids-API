import { prisma } from "../../../database.js";
import { signToken } from "../auth.js";
import { mensajeCliente, transporter, welcomeMessage } from "../mailer.js";
import { encryptPassword, verifyPassword } from "./model.js";
import { createUser, getAllUsers, loginUser } from "./services.js";

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

export const changePassword = async (req, res, next) => {};

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
