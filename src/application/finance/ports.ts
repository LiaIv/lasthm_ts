import type { AccountId, IAccount, ITransaction, TransactionId, TransactionInput } from '../../domain/finance/types.js';

export type IdGenerator = () => string;

export interface IAccountRepository {
  load(): Promise<readonly IAccount[]>;
  save(accounts: readonly IAccount[]): Promise<void>;
}

export interface IAccountService {
  listAccounts(): Promise<readonly IAccount[]>;
  getAccount(id: AccountId): Promise<IAccount>;
  createAccount(name: string): Promise<IAccount>;
  deleteAccount(id: AccountId): Promise<void>;
}

export interface ITransactionService {
  addTransaction(accountId: AccountId, input: TransactionInput): Promise<ITransaction>;
  deleteTransaction(accountId: AccountId, transactionId: TransactionId): Promise<void>;
}

export interface IAccountExporter {
  export(account: IAccount): Promise<string>;
}
