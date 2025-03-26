import { Server } from "socket.io";
import { AppDataSource } from "@/setup/datasource";
import { BetEntity, UserEntity } from "@/entities";
import {
  addBetToCurrentRound,
  onCashout,
  startPendingFlag,
} from "@/controllers/game.controller";

export const setupSocket = (server: any) => {
  const io = new Server(server, {
    cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on("placeBet", async (data: any) => {
      try {
        const { username, amount } = data;

        if (!username || !amount || amount <= 0) {
          return socket.emit("error", { message: "Invalid bet data" });
        }

        const betRepository = AppDataSource.getRepository(BetEntity);
        const userRepository = AppDataSource.getRepository(UserEntity);

        const user = await userRepository.findOne({
          where: { name: username },
        });
        if (!user) return socket.emit("error", { message: "User not found" });

        if (user.balance < amount) {
          return socket.emit("error", { message: "Insufficient balance" });
        }
        const bet = new BetEntity();
        bet.user = user;
        bet.amount = parseFloat(amount.toFixed(4));
        bet.result = "pending";
        bet.crash = 0;
        bet.socketId = socket.id;

        await betRepository.save(bet);
        await userRepository.save(user);

        if (startPendingFlag) addBetToCurrentRound(bet, io);

        // activeBets.set(socket.id, bet);

        console.log(`Bet placed: ${amount} by User: ${username}`);
        socket.emit("betConfirmed", {
          message: "Bet placed successfully",
          bet,
        });
      } catch (error) {
        console.error("Error in placeBet:", error);
        socket.emit("error", {
          message: "Internal server error",
          details: (error as Error).message,
        });
      }
    });

    socket.on("cashout", async (data: any) => {
      try {
        const { username, multiplier } = data;

        if (!username || !multiplier || multiplier <= 1) {
          return socket.emit("error", { message: "Invalid cashout data" });
        }
        await onCashout(username, multiplier, io);
        console.log(`User ${username} cashed out at ${multiplier}x`);
      } catch (error) {
        console.error("Error in cashout:", error);
        socket.emit("error", {
          message: "Internal server error",
          details: (error as Error).message,
        });
      }
    });

    socket.on("disconnect", async () => {
      console.log(`User disconnected: ${socket.id}`);

      // const bet = activeBets.get(socket.id);
      // if (bet) {
      //   bet.result = "lose";

      //   try {
      //     const betRepository = AppDataSource.getRepository(BetEntity);
      //     await betRepository.save(bet);
      //     console.log(`Auto-lost bet for disconnected user: ${bet.user.name}`);
      //   } catch (error) {
      //     console.error("Error saving lost bet:", error);
      //   }

      //   activeBets.delete(socket.id);
      //   io.emit("userDisconnected", { username: bet.user.name });
      // }
    });
  });

  return io;
};
