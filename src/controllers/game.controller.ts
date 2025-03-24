import { BetEntity, UserEntity } from "@/entities";
import { RoundEntity } from "@/entities/round.entity";
import { AppDataSource } from "@/setup/datasource";
import { Request, Response } from "express";
import { Server } from "socket.io";

let currentRound: RoundEntity | null = null;
let gameInterval: NodeJS.Timeout;
let currentRoundBets: BetEntity[] = [];
export let startPendingFlag = false;

export const startGame = async (io: Server) => {
  clearInterval(gameInterval);

  // Emit the game start event
  io.emit("gameStart", {
    crashPoint: currentRound.crashPoint,
    roundId: currentRound.id,
  });

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

    if (multiplier >= currentRound!.crashPoint) {
      // ✅ Ensure `currentRound` is not null
      clearInterval(gameInterval);
      endGame(io);
    }
  }, updateInterval);
};

const endGame = async (io: Server) => {
  io.emit("gameEnd", {
    crashPoint: currentRound.crashPoint,
    roundId: currentRound.id,
  });
  io.emit("cashoutDisabled", true);

  const betRepository = AppDataSource.getRepository(BetEntity);
  const userRepository = AppDataSource.getRepository(UserEntity);

  try {
    for (const bet of currentRoundBets) {
      updateBetResult(bet, currentRound.crashPoint);
      bet.round = currentRound;
      await betRepository.save(bet);
      await userRepository.save(bet.user);
    }

    handleGameRestart(io);
  } catch (error) {
    console.error("Error in endGame:", error);
  }
};

export const addBetToCurrentRound = async (bet: BetEntity, io: Server) => {
  if (startPendingFlag) {
    if (!currentRoundBets.some((b) => b.id === bet.id)) {
      bet.currentFlag = false;
      bet.round = currentRound;
      await AppDataSource.getRepository(BetEntity).save(bet);
      insertSorted(bet);
      emitUserList(io);
    }
  }
};

export const onCashout = async (
  username: string,
  multiplier: number,
  io: Server
) => {
  currentRoundBets.forEach((bet) => {
    if (bet.user.name === username) {
      Object.assign(bet, {
        cashoutAt: parseFloat(multiplier.toFixed(4)),
        result: "win",
        multiplier,
      });
    }
  });
  emitUserList(io);
};

const generateCrashPoint = () =>
  parseFloat((Math.random() * 10 + 1).toFixed(4));

const calculateMultiplier = (timeElapsed: number) => {
  const rate = 0.05 + Math.min(timeElapsed * 0.005, 0.15);
  return parseFloat((1 * Math.pow(Math.E, rate * timeElapsed)).toFixed(4));
};

const updateBetResult = (bet: BetEntity, crashPoint: number) => {
  if (bet.cashoutAt && bet.cashoutAt <= crashPoint) {
    bet.result = "win";
    bet.user.balance = parseFloat(
      (bet.user.balance + bet.amount * bet.cashoutAt).toFixed(4)
    );
  } else {
    bet.result = "lose";
  }
  bet.crash = crashPoint;
};

const handleGameRestart = async (io: Server) => {
  startPendingFlag = true;
  currentRoundBets.forEach((bet) =>
    io.to(bet.socketId).emit("startPending", false)
  );
  const roundRepository = AppDataSource.getRepository(RoundEntity);
  currentRound = roundRepository.create({ crashPoint: generateCrashPoint() });
  await roundRepository.save(currentRound);

  let remainingTime = 7;
  const countdownInterval = setInterval(() => {
    io.emit("countdown", { time: remainingTime-- });
    if (remainingTime === 0) clearInterval(countdownInterval);
  }, 1000);

  setTimeout(() => {
    startPendingFlag = false;
    startGame(io);
  }, 8000);
};

const insertSorted = (bet: BetEntity) => {
  const index = currentRoundBets.findIndex((b) => b.amount < bet.amount);
  index === -1
    ? currentRoundBets.push(bet)
    : currentRoundBets.splice(index, 0, bet);
};

export const emitUserList = (io: Server) => {
  const filteredBets = currentRoundBets.map(
    ({ id, user, amount, cashoutAt }) => ({
      id,
      username: user.name,
      amount,
      cashoutAt,
    })
  );
  io.emit("userList", { filteredBets });
};

export const fetchHistory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const username = String(req.query.username);

    if (!username) {
      res.status(400).json({ error: "User ID is required" });
      return;
    }

    const userRepository = AppDataSource.getRepository(UserEntity);
    const user = await userRepository.findOne({
      where: { name: username },
      relations: ["bets"],
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Include roundId in response
    res.json({
      bets: user.bets.map(
        ({ id, amount, result, round, createdAt, multiplier, crash }) => ({
          id,
          createdAt,
          amount,
          result,
          round,
          multiplier,
          crash,
        })
      ),
    });
  } catch (error) {
    console.error("Error fetching user history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
