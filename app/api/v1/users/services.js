import e from "express";
import { prisma } from "../../../database.js";
import { verifyPassword } from "./model.js";

export const createUser = async (body, password) => {
  // vuelvo minuscula el email

  try {
    const user = prisma.user.create({
      data: {
        ...body,
        password,
        email: body.email.toLowerCase(),
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
        email: email.toLowerCase(),
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
      // ordenar del mas reciente
      orderBy: {
        createdAt: "desc",
      },
    });
    return users;
  } catch (error) {
    throw error;
  }
};
