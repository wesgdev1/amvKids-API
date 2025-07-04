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
router.route("/lowStock").get(controller.getLowStock);
router.route("/search").get(controller.getAllNamesModelsWithColor);
router.route("/search/:searchTerm/filter").get(controller.searchWithFilter);

router.route("/filter").get(controller.filter);

// unitarias

router.route("/count").get(controller.countModels);
router.route("/modelInfo/:id").get(controller.modelInfo);

router.param("id", controller.id);

router
  .route("/:id")
  .get(auth, controller.read)

  .put(auth, controller.updateText)
  .patch(auth, uploads.array("images"), controller.update)
  .delete(auth, controller.remove);
