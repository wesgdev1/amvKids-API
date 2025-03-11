import { Router } from "express";

// eslint-disable-next-line new-cap
export const router = Router();

import * as controller from "./controller.js";
import { auth } from "../auth.js";
import { uploads } from "../../../uploadPhotos/uploads.js";

router.route("/").get(auth, controller.getAll).post(auth, controller.create);
router.route("/myOrders").get(auth, controller.getMyOrders);
router.route("/deleteItems").put(auth, controller.updateOrderItem);
router.route("/ordersByUser/:userId").get(auth, controller.getOrderByUser);

router.param("id", controller.id);

router
  .route("/:id")
  .get(auth, controller.read)
  .put(auth, uploads.array("images"), controller.update)
  .patch(auth, controller.updatePatch)
  .delete(auth, controller.remove);
