import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from "typeorm";
import { UserEntity } from "./user.entity";
import { CoreEntity } from "./core.entity";

@Entity({ name: "bet" })
export class BetEntity extends CoreEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  amount: number;

  @Column({ default: 1 })
  multiplier: number;

  @Column({ nullable: true })
  cashoutAt: number;

  @Column({ default: true })
  currentFlag: boolean;

  @Column({ default: "pending" })
  result: string;

  @Column({ default: 0 })
  crash: number;

  @ManyToOne(() => UserEntity, (user) => user.bets)
  user: UserEntity;
}
