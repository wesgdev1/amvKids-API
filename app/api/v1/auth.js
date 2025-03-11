import jwt from "jsonwebtoken";

import { configuration } from "../../config.js";

const { token } = configuration;
const { secret, expires } = token;

export const signToken = (payload, expiresIn = expires) => {
  return jwt.sign(payload, secret, {
    expiresIn,
  });
};

export const auth = async (req, res, next) => {
  let token = req.headers.authorization || "";

  if (token.startsWith("Bearer")) {
    token = token.substring(7);
  }

  if (!token) {
    return next({ message: "Forbidden", status: 401 });
  }

  jwt.verify(token, secret, function (err, decoded) {
    if (err) {
      return next({ message: "Forbidden", status: 401 });
    }
    req.decoded = decoded;

    next();
  });
};
