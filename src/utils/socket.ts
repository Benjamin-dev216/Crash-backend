import { Server } from "socket.io";
import { AppDataSource } from "@/setup/datasource";
import { BetEntity, UserEntity } from "@/entities";
import { addBetToCurrentRound } from "@/controllers/game.controller";

const activeBets = new Map<string, BetEntity>(); // Track active bets in memory

export const setupSocket = (server: any) => {
  const io = new Server(server, {
    cors: {
      origin: "http://localhost:3000",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

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
        if (!user) return socket.emit("error", { message: "User not found" });

        if (user.balance < amount) {
          return socket.emit("error", { message: "Insufficient balance" });
        }

        user.balance -= amount;

        const bet = new BetEntity();
        bet.user = user;
        bet.amount = amount;
        bet.result = "pending";

        await betRepository.save(bet);
        await userRepository.save(user);

        addBetToCurrentRound(bet, io, false);

        // Store active bet in memory
        activeBets.set(userId, bet);

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

        const bet = activeBets.get(userId);
        if (!bet)
          return socket.emit("error", { message: "No active bet found" });

        bet.cashoutAt = multiplier;
        bet.result = "win";
        bet.user.balance += bet.amount * multiplier;

        activeBets.delete(userId); // Remove from memory

        addBetToCurrentRound(bet, io, true);

        console.log(`User ${userId} cashed out at ${multiplier}x`);
        socket.emit("cashoutConfirmed", { message: "Cashout successful", bet });
      } catch (error) {
        console.error("Error in cashout:", error);
        socket.emit("error", { message: "Internal server error" });
      }
    });

    // Handle disconnection and auto-lose bets
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id}`);

      for (const [userId, bet] of activeBets.entries()) {
        bet.result = "lose"; // Mark as lost
        activeBets.delete(userId); // Remove from memory
        console.log(`Auto-lost bet for disconnected user: ${userId}`);
      }
    });
  });

  // Background task to periodically save bets to the database
  setInterval(async () => {
    if (activeBets.size > 0) {
      const betRepository = AppDataSource.getRepository(BetEntity);
      const userRepository = AppDataSource.getRepository(UserEntity);

      for (const bet of activeBets.values()) {
        await betRepository.save(bet);
        await userRepository.save(bet.user);
      }
      console.log("Batch saved bets to database.");
    }
  }, 5000); // Every 5 seconds

  return io;
};
