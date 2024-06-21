import { signToken } from "../auth.js";
import { encryptPassword, verifyPassword } from "./model.js";
import { createUser, loginUser } from "./services.js";

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

export const changePassword = async (req, res, next) => {};

export const id = async (req, res, next, id) => {};

export const read = async (req, res, next) => {};

export const update = async (req, res, next) => {};
