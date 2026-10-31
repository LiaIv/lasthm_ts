import { Transaction } from './Transaction.js';
import { TransactionType } from './types.js';
import type { IAccount, ITransaction } from './types.js';
import { validateId, validateName } from './validation.js';

function signedAmount(transaction: ITransaction): number {
  return transaction.type === TransactionType.Income ? transaction.amountMinor : -transaction.amountMinor;
}

function validateBalance(balance: number): number {
  if (!Number.isSafeInteger(balance)) {
    throw new Error('Баланс счёта выходит за пределы точного представления суммы.');
  }
  return balance;
}

export class Account implements IAccount {
  public readonly id: string;
  public readonly name: string;
  readonly #transactions = new Map<string, ITransaction>();
  #balanceMinor = 0;

  public constructor(id: string, name: string, transactions: readonly ITransaction[] = []) {
    this.id = validateId(id);
    this.name = validateName(name);
    if (!Array.isArray(transactions)) {
      throw new Error('Транзакции счёта должны быть списком.');
    }
    let total = 0n;
    for (const input of transactions) {
      const transaction = new Transaction(input.id, input);
      if (this.#transactions.has(transaction.id)) {
        throw new Error('Транзакция с таким идентификатором уже существует.');
      }
      this.#transactions.set(transaction.id, transaction);
      total += BigInt(signedAmount(transaction));
    }
    this.#balanceMinor = validateBalance(Number(total));
    Object.freeze(this);
  }

  public get transactions(): readonly ITransaction[] {
    return [...this.#transactions.values()];
  }

  public get balanceMinor(): number {
    return this.#balanceMinor;
  }

  public addTransaction(input: ITransaction): void {
    const transaction = new Transaction(input.id, input);
    if (this.#transactions.has(transaction.id)) {
      throw new Error('Транзакция с таким идентификатором уже существует.');
    }
    const balance = validateBalance(this.#balanceMinor + signedAmount(transaction));
    this.#transactions.set(transaction.id, transaction);
    this.#balanceMinor = balance;
  }

  public deleteTransaction(id: string): void {
    const transaction = this.#transactions.get(id);
    if (transaction === undefined) {
      throw new Error('Транзакция не найдена. Обновите список и повторите выбор.');
    }
    const balance = validateBalance(this.#balanceMinor - signedAmount(transaction));
    this.#transactions.delete(id);
    this.#balanceMinor = balance;
  }
}
