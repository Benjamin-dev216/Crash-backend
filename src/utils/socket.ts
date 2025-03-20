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
    console.log("A user connected:", socket.id);

    // Handle placing a bet
    socket.on("placeBet", async (data: any) => {
      try {
        const { userId, amount } = data;

        if (!userId || !amount || amount <= 0) {
          return socket.emit("error", { message: "Invalid bet data" });
        }

        const betRepository = AppDataSource.getRepository(BetEntity);
        const userRepository = AppDataSource.getRepository(UserEntity);

        const user = await userRepository.findOne({ where: { uuid: userId } });
        if (!user) {
          return socket.emit("error", { message: "User not found" });
        }

        // Ensure the user has enough balance
        if (user.balance < amount) {
          return socket.emit("error", { message: "Insufficient balance" });
        }

        // Deduct balance before saving the bet
        user.balance -= amount;

        const bet = new BetEntity();
        bet.user = user;
        bet.amount = amount;
        bet.result = "pending"; // Default status

        await betRepository.save(bet);
        await userRepository.save(user);

        // Add bet to the current round after saving
        addBetToCurrentRound(bet, io, false);
        console.log(`Bet placed: ${amount} by User: ${userId}`);

        socket.emit("betConfirmed", {
          message: "Bet placed successfully",
          bet,
        });
      } catch (error) {
        console.error("Error in placeBet:", error);
        socket.emit("error", { message: "Internal server error" });
      }
    });

    // Handle cashout
    socket.on("cashout", async (data: any) => {
      try {
        const { userId, multiplier } = data;

        if (!userId || !multiplier || multiplier <= 1) {
          return socket.emit("error", { message: "Invalid cashout data" });
        }

        const betRepository = AppDataSource.getRepository(BetEntity);
        const userRepository = AppDataSource.getRepository(UserEntity);

        // Find the pending bet for the user
        const bet = await betRepository.findOne({
          where: { user: { uuid: userId }, result: "pending" },
          relations: ["user"],
        });

        if (!bet) {
          return socket.emit("error", { message: "No active bet found" });
        }

        // Check if cashout is valid before applying changes
        bet.cashoutAt = multiplier;
        bet.result = "win";
        bet.user.balance += bet.amount * multiplier; // Apply winnings

        await betRepository.save(bet);
        await userRepository.save(bet.user);

        // Notify other users
        addBetToCurrentRound(bet, io, true);
        console.log(`User ${userId} cashed out at ${multiplier}x`);

        socket.emit("cashoutConfirmed", { message: "Cashout successful", bet });
      } catch (error) {
        console.error("Error in cashout:", error);
        socket.emit("error", { message: "Internal server error" });
      }
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  return io;
};
