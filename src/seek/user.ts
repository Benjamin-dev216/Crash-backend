/** @format */

import "reflect-metadata";
import { DataSource } from "typeorm";
import axios from "axios";
import bcrypt from "bcrypt";
import "dotenv/config";
import { UserEntity, BetEntity, RoundEntity } from "@/entities";

// Setup your DB connection
const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_DATABASE,
  entities: [UserEntity, BetEntity, RoundEntity],
  logging: false,
  synchronize: true,
  ssl: {rejectUnauthorized:false}
});

const REMOTE_API = "https://jackpot-junction.org/api/users";

const syncUsersFromRemote = async () => {
  try {
    const response = await axios.get(REMOTE_API);
    const data = response.data;

    if (!data.status || !Array.isArray(data.data)) {
      console.error("❌ Invalid API response");
      return;
    }

    const remoteUsers = data.data;
    const userRepo = AppDataSource.getRepository(UserEntity);

    for (const remoteUser of remoteUsers) {
      const exists = await userRepo.findOne({
        where: { name: remoteUser.username },
      });

      if (!exists) {
        const defaultHashedPassword = await bcrypt.hash("changeme123", 10); // or use uuid or email as password

        const user = userRepo.create({
          name: remoteUser.username,
          hashedPassword: defaultHashedPassword,
          balance: 1000,
        });

        await userRepo.save(user);
        console.log(`✅ Created user: ${remoteUser.username}`);
      } else {
        console.log(`ℹ️ User already exists: ${remoteUser.username}`);
      }
    }

    console.log("🎉 Sync completed!");
  } catch (err) {
    console.error("❌ Error syncing users:", (err as Error).message);
  }
};

// Run after connecting to DB
AppDataSource.initialize()
  .then(() => {
    console.log("📦 DB Connected. Syncing users...");
    return syncUsersFromRemote();
  })
  .catch((err) => {
    console.error("❌ DB init error:", err.message);
  });
