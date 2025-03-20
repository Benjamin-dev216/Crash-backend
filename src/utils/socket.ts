import { Server } from "socket.io";
import { AppDataSource } from "@/setup/datasource";
import { BetEntity, UserEntity } from "@/entities";
import { addBetToCurrentRound } from "@/controllers/game.controller";

export const setupSocket = (server: any) => {
  const io = new Server(server, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("A user connected");

    socket.on("placeBet", async (data: any) => {
      const { userId, amount } = data;
      const betRepository = AppDataSource.getRepository(BetEntity);
      const userRepository = AppDataSource.getRepository(UserEntity);

      const user = await userRepository.findOne({ where: { uuid: userId } });
      if (user) {
        const bet = new BetEntity();
        bet.user = user;
        bet.amount = amount;
        addBetToCurrentRound(bet, io, false);
        await betRepository.save(bet);
        console.log(`Bet placed: ${amount}`);
      }
    });

    socket.on("cashout", async (data: any) => {
      const { userId, multiplier } = data;
      const betRepository = AppDataSource.getRepository(BetEntity);
      const userRepository = AppDataSource.getRepository(UserEntity);

      const bet = await betRepository.findOne({
        where: { user: { uuid: userId }, result: "pending" },
        relations: ["user"],
      });
      if (bet) {
        bet.cashoutAt = multiplier;
        bet.result = "win";
        bet.user.balance += bet.amount * multiplier;
        addBetToCurrentRound(bet, io, true);
        await betRepository.save(bet);
        await userRepository.save(bet.user);
        console.log(`User cashed out at ${multiplier}x`);
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected");
    });
  });

  return io;
};
