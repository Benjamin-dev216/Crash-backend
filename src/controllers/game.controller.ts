import { BetEntity, UserEntity } from "@/entities";
import { AppDataSource } from "@/setup/datasource";
import { Request, Response, NextFunction } from "express";
import { Server } from "socket.io";

let gameInterval: NodeJS.Timeout;
let currentRoundBets: BetEntity[] = []; // Track bets for the current round
let startPendingFlag = false;

export const startGame = async (io: Server) => {
  clearInterval(gameInterval); // Ensure no duplicate intervals

  const crashPoint = Math.floor(Math.random() * 20) + 1; // Random crash point between 1x and 10x
  io.emit("gameStart", { crashPoint });

  let multiplier = 1;
  let timeElapsed = 0;
  let rate = 0.05;
  const updateInterval = 50; // Update every 50ms

  gameInterval = setInterval(() => {
    timeElapsed += updateInterval / 1000; // Convert to seconds

    // Slow down the increase of the rate but keep it capped
    rate = 0.05 + Math.min(timeElapsed * 0.005, 0.15);

    // Exponential multiplier increase
    multiplier = 1 * Math.pow(Math.E, rate * timeElapsed);

    io.emit("multiplierUpdate", { multiplier });

    if (multiplier >= crashPoint) {
      clearInterval(gameInterval);
      endGame(crashPoint, io);
    }
  }, updateInterval); // Update every 50ms
};

const endGame = async (crashPoint: number, io: Server) => {
  io.emit("gameEnd", { crashPoint });

  const betRepository = AppDataSource.getRepository(BetEntity);
  const userRepository = AppDataSource.getRepository(UserEntity);

  try {
    // Process bets for the current round
    for (const bet of currentRoundBets) {
      if (bet.cashoutAt && bet.cashoutAt <= crashPoint) {
        bet.result = "win";
        bet.user.balance += bet.amount * bet.cashoutAt;
        bet.crash = crashPoint;
      } else {
        bet.result = "lose";
      }
      await betRepository.save(bet);
      await userRepository.save(bet.user);
    }

    // Emit the final user list for the round
    emitUserList(io);

    // Delay before fetching previous bets
    setTimeout(async () => {
      currentRoundBets = [];

      try {
        // Fetch list of previous bets
        const result = await betRepository.find({
          where: { currentFlag: true },
          relations: ["user"],
          order: { amount: "DESC" },
        });

        // Mark previous bets as completed
        result.forEach((item) => (item.currentFlag = false));
        await betRepository.save(result);

        currentRoundBets = [...result];

        emitUserList(io);
      } catch (error) {
        console.error("Error fetching previous bets:", error);
      }
    }, 1000);

    // Start the next game after 7 seconds
    startPendingFlag = true;
    setTimeout(() => {
      startPendingFlag = false;
    }, 6000);

    setTimeout(() => {
      startGame(io);
    }, 1000);
  } catch (error) {
    console.error("Error in endGame:", error);
  }
};

export const addBetToCurrentRound = async (
  bet: BetEntity,
  io: Server,
  winningFlag: boolean
) => {
  const betRepository = AppDataSource.getRepository(BetEntity);

  try {
    if (startPendingFlag) {
      bet.currentFlag = false;
      await betRepository.save(bet);
      currentRoundBets = [...currentRoundBets, bet].sort(
        (a, b) => b.amount - a.amount
      );
    } else {
      if (winningFlag) {
        currentRoundBets = currentRoundBets.map((item) =>
          item.id === bet.id ? bet : item
        );
      } else {
        return null;
      }
    }

    // Emit the updated user list for the current round
    emitUserList(io);
  } catch (error) {
    console.error("Error adding bet to current round:", error);
  }
};

export const emitUserList = async (io: Server) => {
  io.emit("userList", currentRoundBets);
};

export const fetchHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = String(req.query.userId);

    if (!userId) {
      res.status(400).json({ error: "User ID is required" });
    }

    const userRepository = AppDataSource.getRepository(UserEntity);
    const user = await userRepository.findOne({
      where: { uuid: userId },
      relations: ["bets"],
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error fetching user history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
