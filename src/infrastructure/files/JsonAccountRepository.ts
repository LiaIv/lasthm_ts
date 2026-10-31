import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { IAccountRepository } from '../../application/finance/ports.js';
import { Account } from '../../domain/finance/Account.js';
import { Transaction } from '../../domain/finance/Transaction.js';
import { TransactionType, type IAccount } from '../../domain/finance/types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTransaction(value: unknown): Transaction {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || (value.type !== TransactionType.Income && value.type !== TransactionType.Expense)
    || typeof value.amountMinor !== 'number'
    || typeof value.date !== 'string'
    || typeof value.category !== 'string'
    || typeof value.note !== 'string') {
    throw new Error('Неверные поля транзакции в файле данных.');
  }
  return new Transaction(value.id, {
    type: value.type,
    amountMinor: value.amountMinor,
    date: value.date,
    category: value.category,
    note: value.note,
  });
}

function readAccount(value: unknown): Account {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.name !== 'string'
    || !Array.isArray(value.transactions)) {
    throw new Error('Неверные поля счёта в файле данных.');
  }
  const transactions: unknown[] = value.transactions;
  return new Account(value.id, value.name, transactions.map(readTransaction));
}

function readAccounts(value: unknown): readonly Account[] {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.accounts)) {
    throw new Error('Неверная структура или неподдерживаемая версия файла данных.');
  }
  const storedAccounts: unknown[] = value.accounts;
  const accounts = storedAccounts.map(readAccount);
  const accountIds = new Set<string>();
  const transactionIds = new Set<string>();
  for (const account of accounts) {
    if (accountIds.has(account.id)) {
      throw new Error('В файле данных повторяются идентификаторы счетов.');
    }
    accountIds.add(account.id);
    for (const transaction of account.transactions) {
      if (transactionIds.has(transaction.id)) {
        throw new Error('В файле данных повторяются идентификаторы транзакций.');
      }
      transactionIds.add(transaction.id);
    }
  }
  return accounts;
}

export class JsonAccountRepository implements IAccountRepository {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = resolve(filePath);
  }

  public async load(): Promise<readonly IAccount[]> {
    let contents: string;
    try {
      contents = await readFile(this.filePath, 'utf8');
    } catch (error: unknown) {
      if (isRecord(error) && error.code === 'ENOENT') {
        return [];
      }
      throw new Error(`Не удалось прочитать файл данных: ${this.filePath}.`, { cause: error });
    }
    try {
      const parsed: unknown = JSON.parse(contents);
      return readAccounts(parsed);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : 'Неизвестная ошибка формата.';
      throw new Error(`Файл данных повреждён: ${this.filePath}. ${detail}`, { cause: error });
    }
  }

  public async save(accounts: readonly IAccount[]): Promise<void> {
    const directory = dirname(this.filePath);
    const temporaryPath = join(directory, `.${basename(this.filePath)}-${randomUUID()}.tmp`);
    try {
      const document = {
        version: 1,
        accounts: accounts.map((account) => ({
          id: account.id,
          name: account.name,
          transactions: account.transactions.map((transaction) => ({
            id: transaction.id,
            type: transaction.type,
            amountMinor: transaction.amountMinor,
            date: transaction.date,
            category: transaction.category,
            note: transaction.note,
          })),
        })),
      };
      readAccounts(document);
      await mkdir(directory, { recursive: true });
      await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
        encoding: 'utf8', flag: 'wx', mode: 0o600,
      });
      await rename(temporaryPath, this.filePath);
    } catch (error: unknown) {
      throw new Error(`Не удалось сохранить данные: ${this.filePath}.`, { cause: error });
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}
