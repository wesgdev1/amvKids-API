import { Router } from "express";

// eslint-disable-next-line new-cap
export const router = Router();

import * as controller from "./controller.js";
import { auth } from "../auth.js";
import { uploads } from "../../../uploadPhotos/uploads.js";

/**
{ * /api/v1/signup POST - register
 * /api/v1/signip POST - login

 
 */

router.route("/signup").post(controller.signup);
router.route("/signin").post(controller.signin);
router.route("/create").post(auth, controller.createUsers);
router.route("/auth/change-password").put(auth, controller.changePassword);
router.route("/getAll").get(auth, controller.getAll);
router.route("/myProfile").get(auth, controller.myProfile);

router.param("id", controller.id);

router
  .route("/:id")
  .get(controller.read)
  .put(auth, controller.update)
  .patch(auth, uploads.array("images"), controller.updatePhoto);
