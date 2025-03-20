import { BetEntity, UserEntity } from "@/entities";
import { AppDataSource } from "@/setup/datasource";

let gameInterval: NodeJS.Timeout;
let currentRoundBets: BetEntity[] = []; // Track bets for the current round
let startPendingFlag = false;

export const startGame = async (io: any) => {
  // Reset the betting user list for the new round

  const crashPoint = Math.floor(Math.random() * 10) + 1; // Random crash point between 1x and 10x
  io.emit("gameStart", { crashPoint });

  let multiplier = 1;
  let increasement = 0.1;
  gameInterval = setInterval(() => {
    multiplier += increasement;
    io.emit("multiplierUpdate", { multiplier });

    if (multiplier >= crashPoint) {
      clearInterval(gameInterval);
      endGame(crashPoint, io);
    }
    increasement *= 1.1;
  }, 50); // Update every second
};

const endGame = async (crashPoint: number, io: any) => {
  io.emit("gameEnd", { crashPoint });

  const betRepository = AppDataSource.getRepository(BetEntity);
  const userRepository = AppDataSource.getRepository(UserEntity);

  // Process bets for the current round
  for (const bet of currentRoundBets) {
    if (bet.cashoutAt && bet.cashoutAt <= crashPoint) {
      bet.result = "win";
      bet.user.balance += bet.amount * bet.cashoutAt;
    } else {
      bet.result = "lose";
    }
    await betRepository.save(bet);
    await userRepository.save(bet.user);
  }

  // Emit the final user list for the round
  emitUserList(io);

  // Delay until next round
  setTimeout(async () => {
    // Fetch list of previouse bets
    const result = await betRepository.find({
      where: { currentFlag: true },
      relations: ["user"],
      order: { amount: "DESC" },
    });

    currentRoundBets = [...result];

    result.map((item) => {
      item.currentFlag = false;
    });
    betRepository.save(result);

    emitUserList(io);
  }, 1000);

  // Start the next game after 7 seconds
  startPendingFlag = true;
  setTimeout(() => {
    startPendingFlag = false;
  }, 6000);
  setTimeout(() => {
    startGame(io);
  }, 1000);
};

export const addBetToCurrentRound = async (
  bet: BetEntity,
  io: any,
  winningFlag: boolean
) => {
  const betRepository = AppDataSource.getRepository(BetEntity);
  if (startPendingFlag) {
    bet.currentFlag = false;
    betRepository.save(bet);
    currentRoundBets = [...currentRoundBets, bet];
    currentRoundBets.sort((a, b) => b.amount - a.amount);
    emitUserList(io);
  } else {
    if (winningFlag)
      currentRoundBets.map((item) => {
        item.id === bet.id ? bet : item;
      });
    else return null;
  }

  // Emit the updated user list for the current round
  emitUserList(io);
};

export const emitUserList = async (io: any) => {
  // Emit only the bets for the current round
  io.emit("userList", currentRoundBets);
};
