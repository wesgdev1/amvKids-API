import { Router } from "express";

// eslint-disable-next-line new-cap
export const router = Router();

import * as controller from "./controller.js";
import { uploads } from "../../../uploadPhotos/uploads.js";
import { auth } from "../auth.js";

router
  .route("/")
  .get(controller.getAll)

  .post(uploads.array("images"), auth, controller.create);

router.route("/search/:searchTerm").get(controller.search);
router.route("/curvas").get(controller.getAllCurvas);
router.route("/recommended").get(controller.getRecommended);

router.route("/filter").get(controller.filter);

router.param("id", controller.id);

router
  .route("/:id")
  .get(auth, controller.read)

  .put(auth, controller.updateText)
  .patch(auth, uploads.array("images"), controller.update)
  .delete(auth, controller.remove);
