import { Router } from "express";

// eslint-disable-next-line new-cap
export const router = Router();

import * as controller from "./controller.js";
import { auth } from "../auth.js";
import { uploads } from "../../../uploadPhotos/uploads.js";

router.route("/").get(controller.getAll).post(auth, controller.create);
router.route("/myOrders").get(controller.getMyOrders);

router.param("id", controller.id);

router
  .route("/:id")
  .get(auth, controller.read)
  .put(auth, uploads.array("images"), controller.update)
  .patch(controller.update)
  .delete(controller.remove);
