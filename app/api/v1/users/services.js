import { prisma } from "../../../database.js";
import { verifyPassword } from "./model.js";

export const createUser = async (body, password) => {
  try {
    const user = prisma.user.create({
      data: {
        ...body,
        password,
      },
    });

    return user;
  } catch (error) {
    throw error;
  }
};

export const loginUser = async (email, password) => {
  try {
    const user = prisma.user.findUnique({
      where: {
        email,
      },
    });

    return user;
  } catch (error) {
    throw error;
  }
};

export const getAllUsers = async () => {
  try {
    const users = prisma.user.findMany({
      // donde el tipo no sea admin
      where: {
        tipoUsuario: {
          not: "Admin",
        },
      },
    });
    return users;
  } catch (error) {
    throw error;
  }
};
