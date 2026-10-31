import { Account } from '../../domain/finance/Account.js';
import { Transaction } from '../../domain/finance/Transaction.js';
import type { AccountId, IAccount, ITransaction, TransactionId, TransactionInput } from '../../domain/finance/types.js';
import type { IAccountRepository, IAccountService, IdGenerator, ITransactionService } from './ports.js';

function copyAccount(account: IAccount): Account {
  return new Account(account.id, account.name, account.transactions);
}

function findAccount(accounts: readonly Account[], id: AccountId): Account {
  const account = accounts.find((candidate) => candidate.id === id);
  if (account === undefined) {
    throw new Error('Счёт не найден. Обновите список и повторите выбор.');
  }
  return account;
}

export class AccountManager implements IAccountService, ITransactionService {
  public constructor(
    private readonly repository: IAccountRepository,
    private readonly generateId: IdGenerator,
  ) {}

  public async listAccounts(): Promise<readonly IAccount[]> {
    return this.loadAccounts();
  }

  public async getAccount(id: AccountId): Promise<IAccount> {
    return findAccount(await this.loadAccounts(), id);
  }

  public async createAccount(name: string): Promise<IAccount> {
    const accounts = await this.loadAccounts();
    const account = new Account(this.generateId(), name);
    if (accounts.some((candidate) => candidate.id === account.id)) {
      throw new Error('Счёт с таким идентификатором уже существует. Повторите создание для нового уникального идентификатора.');
    }
    await this.repository.save([...accounts, account]);
    return copyAccount(account);
  }

  public async deleteAccount(id: AccountId): Promise<void> {
    const accounts = await this.loadAccounts();
    findAccount(accounts, id);
    await this.repository.save(accounts.filter((account) => account.id !== id));
  }

  public async addTransaction(accountId: AccountId, input: TransactionInput): Promise<ITransaction> {
    const accounts = await this.loadAccounts();
    const account = findAccount(accounts, accountId);
    const transaction = new Transaction(this.generateId(), input);
    if (accounts.some((candidate) => candidate.transactions.some((existing) => existing.id === transaction.id))) {
      throw new Error('Транзакция с таким идентификатором уже существует. Повторите добавление.');
    }
    account.addTransaction(transaction);
    await this.repository.save(accounts);
    return transaction;
  }

  public async deleteTransaction(accountId: AccountId, transactionId: TransactionId): Promise<void> {
    const accounts = await this.loadAccounts();
    findAccount(accounts, accountId).deleteTransaction(transactionId);
    await this.repository.save(accounts);
  }

  private async loadAccounts(): Promise<Account[]> {
    return (await this.repository.load()).map(copyAccount);
  }
}
