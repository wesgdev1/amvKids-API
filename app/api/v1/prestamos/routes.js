import { Router } from "express";

// eslint-disable-next-line new-cap
export const router = Router();

import * as controller from "./controllers.js";
import { auth } from "../auth.js";

router.route("/").get(auth, controller.getAll).post(auth, controller.create);

// Listado de tiendas aliadas para el formulario (antes de /:id)
router.route("/tiendas-aliadas").get(auth, controller.getTiendasAliadas);

router.param("id", controller.id);

router
  .route("/:id")
  .get(auth, controller.read)
  .put(auth, controller.update)
  .patch(auth, controller.update)
  .delete(auth, controller.remove);

router.route("/:id/items").post(auth, controller.addItems);

router.route("/:id/devolver-todos").patch(auth, controller.devolverTodos);

router.route("/:id/items/:itemId").delete(auth, controller.removeItem);

router.route("/:id/items/:itemId/devolver").patch(auth, controller.devolverItem);
