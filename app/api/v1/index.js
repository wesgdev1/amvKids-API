import { Router } from "express";

import { router as users } from "./users/routes.js";
import { router as products } from "./products/routes.js";
import { router as model } from "./model/routes.js";
import { router as stock } from "./stock/routes.js";
import { router as order } from "./order/routes.js";

// eslint-disable-next-line new-cap
export const router = Router();

router.use("/users", users);
router.use("/products", products);
router.use("/models", model);
router.use("/stocks", stock);
router.use("/orders", order);
