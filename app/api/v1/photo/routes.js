import { Router } from "express";

// eslint-disable-next-line new-cap
export const router = Router();

import * as controller from "./controller.js";
import { auth } from "../auth.js";
import { uploads } from "../../../uploadPhotos/uploads.js";

router
  .route("/")
  .get(controller.getAll)
  .post(uploads.array("images"), auth, controller.create);

router.param("id", controller.id);

router
  .route("/:id")
  .get(controller.read)
  .put(auth, controller.update)
  .patch(controller.update)
  .delete(controller.remove);
