/** @format */

import { AppDataSource } from "./datasource";
import "dotenv/config";

export const databaseSetup = async (): Promise<void> => {

  await AppDataSource.initialize();
};
