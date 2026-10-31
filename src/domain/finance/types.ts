export type AccountId = string;
export type TransactionId = string;
export type IsoDate = string;

export enum TransactionType {
  Income = 'income',
  Expense = 'expense',
}

export interface TransactionInput {
  readonly type: TransactionType;
  readonly amountMinor: number;
  readonly date: IsoDate;
  readonly category: string;
  readonly note: string;
}

export interface ITransaction extends TransactionInput {
  readonly id: TransactionId;
}

export interface IAccount {
  readonly id: AccountId;
  readonly name: string;
  readonly transactions: readonly ITransaction[];
  readonly balanceMinor: number;
}
