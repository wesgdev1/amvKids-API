import { Router } from "express";

// eslint-disable-next-line new-cap
export const router = Router();

import * as controller from "./controller.js";
import { auth } from "../auth.js";
import { uploads } from "../../../uploadPhotos/uploads.js";

router.route("/").get(auth, controller.getAll).post(auth, controller.create);
router.route("/preparer").get(auth, controller.getAllPreparer);
router.route("/myOrders").get(auth, controller.getMyOrders);
router.route("/deleteItems").put(auth, controller.updateOrderItem);
router.route("/deleteItemsUnity").put(auth, controller.updateOrderItemUnity);
router.route("/applyDiscount").put(auth, controller.aplicarDescuento);
router.route("/ordersByUser/:userId").get(auth, controller.getOrderByUser);
router.route("/pagos").post(controller.crearLinkDePago);
router.route("/webhookBold").post(controller.webhook);
router.route("/countOrderByDate").post(controller.countOrderByDate);
router
  .route("/sumarTotalOrdenesByDate")
  .post(controller.sumarTotalOrdenesByDate);

router
  .route("/sumarParesVendidosPorFecha")
  .post(controller.sumarParesVendidosPorFecha);

router.route("/modeloMasVendido").post(controller.modeloMasVendidoPorFecha);

router.param("id", controller.id);

router
  .route("/:id")
  .get(auth, controller.read)
  .put(auth, uploads.array("images"), controller.update)
  .patch(auth, controller.updatePatch)
  .delete(auth, controller.remove);
