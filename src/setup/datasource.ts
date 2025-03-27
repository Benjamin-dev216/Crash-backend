/** @format */

import { DataSource } from "typeorm";
import { UserEntity, BetEntity, RoundEntity } from "@/entities";
import "dotenv/config";

export const AppDataSource = new DataSource({
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
