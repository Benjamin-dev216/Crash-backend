import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
} from "typeorm";
import { BetEntity } from "./bet.entity";

@Entity("rounds")
export class RoundEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  startTime: Date;

  @Column({ type: "decimal", precision: 10, scale: 4, nullable: true })
  crashPoint: number;

  @OneToMany(() => BetEntity, (bet) => bet.round, { cascade: true })
  bets: BetEntity[];
}
