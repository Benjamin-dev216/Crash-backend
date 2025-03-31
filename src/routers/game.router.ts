import { gameController } from "@/controllers";
import { Router } from "express";

export const gameRouter = Router();

gameRouter.get("/history/:userId", gameController.fetchHistory);
