import { Server } from "socket.io";
import { AppDataSource } from "@/setup/datasource";
import { BetEntity, UserEntity } from "@/entities";
import { addBetToCurrentRound, onCashout } from "@/controllers/game.controller";

const activeBets = new Map<string, BetEntity>();

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

        user.balance = parseFloat((user.balance - amount).toFixed(4));

        const bet = new BetEntity();
        bet.user = user;
        bet.amount = parseFloat(amount.toFixed(4));
        bet.result = "pending";
        bet.crash = 0;
        bet.socketId = socket.id; // ✅ Store socket ID

        await betRepository.save(bet);
        await userRepository.save(user);

        addBetToCurrentRound(bet, io);

        activeBets.set(socket.id, bet); // ✅ Track by socket ID

        console.log(`Bet placed: ${amount} by User: ${username}`);
        socket.emit("betConfirmed", {
          message: "Bet placed successfully",
          bet,
        });
      } catch (error) {
        console.error("Error in placeBet:", error);
        socket.emit("error", { message: "Internal server error" });
      }
    });

    socket.on("cashout", async (data: any) => {
      try {
        const { username, multiplier } = data;

        if (!username || !multiplier || multiplier <= 1) {
          return socket.emit("error", { message: "Invalid cashout data" });
        }
        onCashout(username, multiplier, io);

        console.log(`User ${username} cashed out at ${multiplier}x`);
      } catch (error) {
        console.error("Error in cashout:", error);
        socket.emit("error", { message: "Internal server error" });
      }
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id}`);

      const bet = activeBets.get(socket.id);
      if (bet) {
        bet.result = "lose"; // Mark as lost
        activeBets.delete(socket.id); // ✅ Remove bet from memory
        console.log(`Auto-lost bet for disconnected user: ${bet.user.name}`);
      }
    });
  });

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
  }, 5000);

  return io;
};
