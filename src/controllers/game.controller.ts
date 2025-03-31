import { BetEntity, UserEntity, RoundEntity } from "@/entities";
import { AppDataSource } from "@/setup/datasource";
import { Request, Response, NextFunction } from "express";
import { Server } from "socket.io";
import { IsNull, Not } from "typeorm";

let currentRound: RoundEntity | null = null;
let gameInterval: NodeJS.Timeout;
let currentRoundBets: BetEntity[] = []; // Track bets for the current round
export let startPendingFlag = false;

export const startGame = async (io: Server) => {
  clearInterval(gameInterval);

  for (const bet of currentRoundBets) {
    io.to(bet.socketId).emit("cashoutDisabled", false);
  }

  const roundRepository = AppDataSource.getRepository(RoundEntity);

  // ✅ Create and save a new round before using it
  currentRound = new RoundEntity();
  currentRound.crashPoint = generateCrashPoint();

  try {
    currentRound = await roundRepository.save(currentRound); // ✅ Save round in DB
  } catch (error) {
    console.error("Error saving round:", error);
    return; // Exit function if there's an error
  }

  io.emit("gameStart", {
    crashPoint: currentRound.crashPoint,
    roundId: currentRound.id,
  });

  let multiplier = 1;
  let timeElapsed = 0;
  let rate = 0.05;
  const updateInterval = 50;

  gameInterval = setInterval(() => {
    if (!currentRound) {
      console.error("Error: currentRound is null during game loop!");
      clearInterval(gameInterval);
      return;
    }

    timeElapsed += updateInterval / 1000;
    rate = 0.05 + Math.min(timeElapsed * 0.005, 0.15);
    multiplier = parseFloat(
      (1 * Math.pow(Math.E, rate * timeElapsed)).toFixed(4)
    );

    io.emit("multiplierUpdate", { multiplier });

    if (multiplier >= currentRound.crashPoint) {
      clearInterval(gameInterval);
      endGame(currentRound.crashPoint, io);
    }
  }, updateInterval);
};

// When game ends all amount calculations are done, So you can add api call here

const endGame = async (crashPoint: number, io: Server) => {
  io.emit("gameEnd", { crashPoint });
  io.emit("cashoutDisabled", true);

  const betRepository = AppDataSource.getRepository(BetEntity);
  const userRepository = AppDataSource.getRepository(UserEntity);

  try {
    const processedUsers = new Map<string, string>(); // Track processed users

    for (const bet of currentRoundBets) {
      if (bet.cashoutAt && bet.cashoutAt <= crashPoint) {
        bet.result = "win";
        bet.user.balance = parseFloat(
          (
            Number(bet.user.balance) +
            Number(bet.amount) * Number(bet.cashoutAt)
          ).toFixed(4)
        );
      } else {
        bet.result = "lose";
        bet.user.balance = Math.max(
          0,
          parseFloat((bet.user.balance - bet.amount).toFixed(4))
        );
      }

      bet.crash = crashPoint;
      bet.round = currentRound;

      await betRepository.save(bet);
      await userRepository.save(bet.user);

      processedUsers.set(bet.user.name, bet.socketId); // Add user to processed list
      io.to(bet.socketId).emit("betResult", {win: bet.result === 'win', amount: bet.amount})
    }

    emitUserList(io, true);

    // 🔥 Emit history update for each unique user at the end of the round
    for (const [username, socketId] of processedUsers) {
      emitUserHistory(username, socketId, io);
    }

    // Reset bets and start next round
    setTimeout(async () => {
      currentRoundBets = [];

      const result = await betRepository.find({
        where: { currentFlag: true },
        relations: ["user"],
        order: { amount: "DESC" },
      });

      result.forEach((item) => (item.currentFlag = false));
      await betRepository.save(result);

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

export const emitUserHistory = async (
  username: string,
  socketId: string,
  io: Server
) => {
  const betRepository = AppDataSource.getRepository(BetEntity);

  try {
    const bets = await betRepository.find({
      where: {
        user: { name: username },
        round: { id: Not(IsNull()) }, // Ensures roundId is not null
      },
      relations: ["round"],
      order: { createdAt: "DESC" },
      take: 10,
    });

    io.to(socketId).emit("userHistoryUpdate", {
      bets: bets.map(
        ({ id, amount, result, round, createdAt, multiplier, crash }) => ({
          id,
          createdAt,
          roundId: round.id,
          amount,
          odds: multiplier || 0,
          winAmount: multiplier ? amount * multiplier : 0,
          crashPoint: crash,
          result,
        })
      ),
    });
  } catch (error) {
    console.error("Error emitting user history:", error);
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
  if(startPendingFlag) return null;
  currentRoundBets.forEach((item) => {
    if (item.user.name !== username) return;
  
    item.cashoutAt = parseFloat(multiplier.toFixed(4));
    item.result = multiplier <= currentRound.crashPoint ? "win" : "lose";
    item.multiplier = multiplier<= currentRound.crashPoint? multiplier: null;
  
    if (item.result === "win") {
      emitUserList(io, false);
    }
  });
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
  const filteredBets = currentRoundBets
    .map(({ id, user, amount, cashoutAt, result, multiplier }) => ({
      id,
      username: user.name,
      amount,
      cashoutAt,
      result,
      multiplier,
    }))
    .slice(0, 40);

  const numberOfPlayers = currentRoundBets?.length;

  const totalBets = currentRoundBets.reduce(
    (sum, bet) => sum + Number(bet.amount || 0),
    0
  );

  const totalWinnings = currentRoundBets.reduce(
    (sum, bet) =>
      sum +
      (bet.result === "win"
        ? Number(bet.amount || 0) * (Number(bet.multiplier) || 1)
        : 0),
    0
  );

  io.emit("userList", {
    filteredBets,
    gameEndFlag,
    numberOfPlayers,
    totalBets: parseFloat(totalBets.toFixed(4)), // Ensures a valid number before formatting
    totalWinnings: parseFloat(totalWinnings.toFixed(4)), // Ensures a valid number before formatting
  });
};

export const fetchHistory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      res.status(400).json({ error: "User name is required" });
    }

    const betRepository = AppDataSource.getRepository(BetEntity);
    const bets = await betRepository.find({
      where: { user: { uuid: userId } },
      relations: ["round"],
      order: { createdAt: "DESC" },
      take: 10,
    });
    if (!bets) {
      res.status(404).json({ error: "Bets not found" });
    }

    res.json({
      bets: bets.map(
        ({ id, amount, result, round, createdAt, multiplier, crash }) => ({
          id,
          createdAt,
          roundId: round.id,
          amount,
          odds: multiplier ? multiplier : 0,
          winAmount: amount * multiplier,
          crashPoint: crash,
          result,
        })
      ),
    });
  } catch (error) {
    console.error("Error fetching user history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

function generateCrashPoint(): number {
  const r = Math.random();

  if (r < 0.01) {
    return 1.00; // Instant crash
  }

  if (r < 0.81) {
    // 80% chance: 1.01x - 3.00x
    return parseFloat((Math.random() * (3.0 - 1.01) + 1.01).toFixed(2));
  } else {
    // 19% chance: 3.01x - 100x, skewed to be mostly lower
    const base = Math.random();
    const crash = 3.01 + Math.pow(1 - base, 2) * (100 - 3.01);
    return parseFloat(crash.toFixed(2));
  }
}