import express from "express";
import { router as api } from "./api/v1/index.js";

export const app = express();

app.use(express.json());

app.use("/api", api);
app.use("/api/v1", api);
// Not route error handler
app.use((req, res, next) => {
  next({ message: "Route Not found", status: 404 });
});

// Error handler
app.use((err, req, res, next) => {
  const { message, status = 500 } = err;

  res.status(status);
  res.json({ error: { message, status } });
});