import { Router } from "express";

// eslint-disable-next-line new-cap
export const router = Router();

import * as controller from "./controller.js";
import { auth } from "../auth.js";

router.route("/").get(controller.getAll).post(auth, controller.create);
router.route("/countPairs").get(controller.countQuantityforTotalStock);

router.param("id", controller.id);

router
  .route("/:id")
  .get(controller.read)
  .put(auth, controller.update)
  .patch(controller.update)
  .delete(controller.remove);
