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
  // app.use(clientUse());
  // app.use([authMiddleware, routeMiddleware]);
  app.use("/health", (_req: Request, res: Response) => {
    res.send("It's healthy!");
  }); //health check

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../client/build')));
  
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, '../client/build', 'index.html'));
    });
  }

  app.use("/api", router);

  app.use(errorHandlerMiddleware);

  const server = createServer(app);
  const io = setupSocket(server);

  const port = process.env.PORT || 4000;

  server.listen(port, () => {
    Logger.info(`Sever is running on ${port}`);
    startGame(io);
  });
};
