import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
} from "typeorm";
import { BetEntity } from "./bet.entity";

@Entity()
export class RoundEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: "decimal", precision: 10, scale: 4, nullable: false })
  crashPoint: number;

  @OneToMany(() => BetEntity, (bet) => bet.round)
  bets: BetEntity[];
}
