import { BetEntity, UserEntity } from "@/entities";
import { AppDataSource } from "@/setup/datasource";
import { Request, Response, NextFunction } from "express";
import { Server } from "socket.io";

let gameInterval: NodeJS.Timeout;
let currentRoundBets: BetEntity[] = []; // Track bets for the current round
let startPendingFlag = false;

export const startGame = async (io: Server) => {
  clearInterval(gameInterval);

  const crashPoint = parseFloat((Math.random() * 10 + 1).toFixed(4)); // Random crash point between 1x and 20x
  io.emit("gameStart", { crashPoint });

  let multiplier = 1;
  let timeElapsed = 0;
  let rate = 0.05;
  const updateInterval = 50;

  gameInterval = setInterval(() => {
    timeElapsed += updateInterval / 1000;
    rate = 0.05 + Math.min(timeElapsed * 0.005, 0.15);
    multiplier = parseFloat(
      (1 * Math.pow(Math.E, rate * timeElapsed)).toFixed(4)
    );

    io.emit("multiplierUpdate", { multiplier });

    if (multiplier >= crashPoint) {
      clearInterval(gameInterval);
      endGame(crashPoint, io);
    }
  }, updateInterval);
};

const endGame = async (crashPoint: number, io: Server) => {
  io.emit("gameEnd", { crashPoint });

  const betRepository = AppDataSource.getRepository(BetEntity);
  const userRepository = AppDataSource.getRepository(UserEntity);

  try {
    for (const bet of currentRoundBets) {
      if (bet.cashoutAt && bet.cashoutAt <= crashPoint) {
        bet.result = "win";
        bet.user.balance = parseFloat(
          (
            Number(bet.user.balance) +
            Number(bet.amount) * Number(bet.cashoutAt)
          ).toFixed(4)
        );
        bet.crash = crashPoint;
      } else {
        bet.result = "lose";
      }
      await betRepository.save(bet);
      await userRepository.save(bet.user);
    }

    emitUserList(io);

    setTimeout(async () => {
      currentRoundBets = [];
      try {
        const result = await betRepository.find({
          where: { currentFlag: true },
          relations: ["user"],
          order: { amount: "DESC" },
        });

        result.forEach((item) => (item.currentFlag = false));
        await betRepository.save(result);

        currentRoundBets = [...result];
        emitUserList(io);
      } catch (error) {
        console.error("Error fetching previous bets:", error);
      }
    }, 1000);

    startPendingFlag = true;
    io.emit("startPending", startPendingFlag);
    let remainingTime = 7;

    const countdownInterval = setInterval(() => {
      io.emit("countdown", { time: remainingTime });
      remainingTime--;
      if (remainingTime === 0) {
        clearInterval(countdownInterval);
        startPendingFlag = false;
        io.emit("startPending", startPendingFlag);
      }
    }, 1000);

    setTimeout(() => {
      startGame(io);
    }, 8000);
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
