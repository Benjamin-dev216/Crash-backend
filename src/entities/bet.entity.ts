import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from "typeorm";
import { UserEntity } from "./user.entity";
import { CoreEntity } from "./core.entity";

@Entity({ name: "bet" })
export class BetEntity extends CoreEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "numeric", precision: 10, scale: 4 })
  amount: number;

  @Column({ type: "numeric", precision: 10, scale: 4, default: 1 })
  multiplier: number;

  @Column({ type: "numeric", precision: 10, scale: 4, nullable: true })
  cashoutAt: number;

  @Column({ default: true })
  currentFlag: boolean;

  @Column({ default: "pending" })
  result: string;

  @Column({ type: "numeric", precision: 10, scale: 4, default: 0 })
  crash: number;

  @ManyToOne(() => UserEntity, (user) => user.bets)
  user: UserEntity;
}
