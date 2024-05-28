import { Router } from "express";
import { router as blogs } from "./blogs/routes.js";

// eslint-disable-next-line new-cap
export const router = Router();

router.use("/blogs", blogs);
