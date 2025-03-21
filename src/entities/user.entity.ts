/** @format */

import { Column, Entity, PrimaryGeneratedColumn, OneToMany } from "typeorm";
import { BetEntity } from "./bet.entity";
import { CoreEntity } from "./core.entity";

@Entity({ name: "user" })
export class UserEntity extends CoreEntity {
  @PrimaryGeneratedColumn("uuid")
  uuid: string;

  @Column({ name: "name" })
  name: string;

  @Column({ name: "hashed_password" })
  hashedPassword: string;

  @Column({ type: "numeric", precision: 10, scale: 4, default: 1000 })
  balance: number;

  @OneToMany(() => BetEntity, (bet) => bet.user)
  bets: BetEntity[];
}
