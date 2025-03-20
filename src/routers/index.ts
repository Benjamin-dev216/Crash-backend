/** @format */

import express from "express";
import { authRouter } from "./auth.router";
import { gameRouter } from "./game.router";

const router = express.Router();

router.use("/auth", authRouter);
router.use("/game", gameRouter);

export default router;
