import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { RoundEntity } from "./round.entity"; // ✅ Ensure correct import
import { UserEntity } from "./user.entity";

@Entity("bets")
export class BetEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => UserEntity, (user) => user.bets, {
    eager: true,
  })
  @JoinColumn({ name: "userId" })
  user: UserEntity;

  @ManyToOne(() => RoundEntity, (round) => round.bets, {
    eager: true,
  }) // ✅ Ensure this relation is correct
  @JoinColumn({ name: "roundId" })
  round: RoundEntity;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  amount: number;

  @Column({ type: "decimal", precision: 10, scale: 4, nullable: true })
  cashoutAt?: number;

  @Column({ type: "decimal", precision: 10, scale: 4, nullable: true })
  multiplier?: number;

  @Column({ type: "varchar", length: 10, default: "pending" })
  result: string;

  @Column({ type: "decimal", precision: 10, scale: 4, nullable: true })
  crash?: number;

  @Column({ type: "boolean", default: true })
  currentFlag: boolean;

  @Column({ type: "varchar", length: 255, nullable: true })
  socketId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
