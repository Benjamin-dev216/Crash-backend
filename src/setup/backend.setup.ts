/** @format */

import express, { Express, Request, Response } from "express";
import cors from "cors";
import router from "@/routers";
import path from 'path'
import { createServer } from "http";
import { Logger } from "@/utils";
import {
  authMiddleware,
  errorHandlerMiddleware,
} from "@/middlewares";
import { startGame } from "@/controllers/game.controller";
import { setupSocket } from "@/utils/socket";

export const backendSetup = () => {
  const app: Express = express();

  app.use(cors());
  app.use(express.json());

  app.use("/health", (_req: Request, res: Response) => {
    res.send("It's healthy!");
  });

  // 👇 Serve frontend only in production
  if (process.env.NODE_ENV === 'production') {
    const clientBuildPath = path.resolve(__dirname, '../../../client/dist');
    app.use(express.static(clientBuildPath));
  }

  // ✅ Mount API routes before catch-all
  app.use("/api", router);

  // ✅ Catch-all AFTER API routes
  if (process.env.NODE_ENV === 'production') {
    const clientBuildPath = path.resolve(__dirname, '../../../client/dist');
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientBuildPath, 'index.html'));
    });
  }

  // Error handler
  app.use(errorHandlerMiddleware);

  const server = createServer(app);
  const io = setupSocket(server);

  const port = process.env.PORT || 4000;
  server.listen(port, () => {
    Logger.info(`Server is running on port ${port}`);
    startGame(io);
  });
};
