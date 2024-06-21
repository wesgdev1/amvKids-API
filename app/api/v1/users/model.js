import { hash, compare } from "bcrypt";

export const fields = [
  "id",
  "email",
  "name",
  "password",
  "createdAt",
  "updatedAt",
];

export const encryptPassword = (password) => {
  return hash(password, 10);
};

export const verifyPassword = (password, encryptPassword) => {
  return compare(password, encryptPassword);
};
