import { BetEntity, UserEntity } from "@/entities";
import { AppDataSource } from "@/setup/datasource";
import { Request, Response, NextFunction } from "express";
import { Server } from "socket.io";

let gameInterval: NodeJS.Timeout;
let currentRoundBets: BetEntity[] = []; // Track bets for the current round
export let startPendingFlag = false;

export const startGame = async (io: Server) => {
  clearInterval(gameInterval);

  for (const bet of currentRoundBets) {
    io.to(bet.socketId).emit("cashoutDisabled", false);
  }

  const crashPoint = parseFloat((Math.random() * 10 + 1).toFixed(4)); // Random crash point
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
  io.emit("cashoutDisabled", true);
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
        // console.log(bet.user.balance, bet.amount, bet.cashoutAt);
      } else {
        bet.result = "lose";
      }

      await betRepository.save(bet);
      await userRepository.save(bet.user);
    }

    emitUserList(io, true);
    setTimeout(async () => {
      currentRoundBets = [];
      const result = await betRepository.find({
        where: { currentFlag: true },
        relations: ["user"],
        order: { amount: "DESC" },
      });
      console.log(result);

      result.forEach((item) => (item.currentFlag = false));
      await betRepository.save(result);
      console.log(result);

      currentRoundBets = [...result];
      emitUserList(io, false);

      io.emit("startPending", true);

      for (const bet of currentRoundBets) {
        io.to(bet.socketId).emit("startPending", false);
      }

      startPendingFlag = true;
      let remainingTime = 7;
      const countdownInterval = setInterval(() => {
        io.emit("countdown", { time: remainingTime });
        remainingTime--;
        if (remainingTime === 0) {
          clearInterval(countdownInterval);
          io.emit("startPending", false);
        }
      }, 1000);

      setTimeout(() => {
        startPendingFlag = false;
        startGame(io);
        io.emit("startPending", true);
      }, 8000);
    }, 1000);
  } catch (error) {
    console.error("Error in endGame:", error);
  }
};

export const addBetToCurrentRound = async (bet: BetEntity, io: Server) => {
  const betRepository = AppDataSource.getRepository(BetEntity);

  try {
    if (startPendingFlag) {
      const existingBet = currentRoundBets.find((b) => b.id === bet.id);
      if (!existingBet) {
        bet.currentFlag = false;
        await betRepository.save(bet);
        insertSorted(bet);
        emitUserList(io, false);
      }
    }
  } catch (error) {
    console.error("Error adding bet to current round:", error);
  }
};

export const onCashout = async (
  username: String,
  multiplier: number,
  io: Server
) => {
  currentRoundBets.map((item) => {
    if (item.user.name === username) {
      item.cashoutAt = parseFloat(multiplier.toFixed(4));
      item.result = "win";
      item.multiplier = multiplier;
    }
  });
  emitUserList(io, false);
};

const insertSorted = (bet: BetEntity) => {
  const exists = currentRoundBets.some((b) => b.id === bet.id);
  if (exists) return;

  let index = currentRoundBets.findIndex((b) => b.amount < bet.amount);
  if (index === -1) {
    currentRoundBets.push(bet);
  } else {
    currentRoundBets.splice(index, 0, bet);
  }
};

export const emitUserList = async (io: Server, gameEndFlag: boolean) => {
  const filteredBets = currentRoundBets.map(
    ({ id, user, amount, cashoutAt }) => ({
      id,
      username: user.name,
      amount,
      cashoutAt,
    })
  );

  io.emit("userList", { filteredBets, gameEndFlag });
};

export const fetchHistory = async (
  req: Request,
  res: Response
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
