import type { IAccountExporter, IAccountService, ITransactionService } from '../../application/finance/ports.js';
import { TransactionType } from '../../domain/finance/types.js';
import type { AccountId, IAccount, TransactionInput } from '../../domain/finance/types.js';
import { parseAmount, validateCategory, validateDate, validateName, validateNote } from '../../domain/finance/validation.js';
import { asValidator, formatMoney, formatTransaction, today } from './formatting.js';
import type { Choice, IUserInterface } from './ports.js';

type MainAction = { readonly type: 'create' } | { readonly type: 'open'; readonly id: AccountId } | { readonly type: 'exit' };
type AccountAction = 'add' | 'delete-transaction' | 'export' | 'delete-account' | 'back';

export class ApplicationController {
  private selectedAccountId: AccountId | undefined;
  private running = true;
  private notice = '';

  public constructor(
    private readonly accounts: IAccountService,
    private readonly transactions: ITransactionService,
    private readonly exporter: IAccountExporter,
    private readonly ui: IUserInterface,
  ) {}

  public async run(): Promise<void> {
    try {
      while (this.running) {
        this.ui.clear();
        this.ui.display('ЛИЧНЫЙ БЮДЖЕТ · RUB\n');
        if (this.notice) {
          this.ui.display(this.notice);
          this.notice = '';
        }
        try {
          if (this.selectedAccountId === undefined) await this.showMainMenu();
          else await this.showAccount(this.selectedAccountId);
        } catch (error: unknown) {
          if (this.isCancellation(error)) throw error;
          this.ui.display(`Ошибка: ${error instanceof Error ? error.message : 'Не удалось выполнить действие.'}`);
          this.running = await this.ui.confirm('Вернуться в главное меню и попробовать снова?');
          this.selectedAccountId = undefined;
        }
      }
    } catch (error: unknown) {
      if (!this.isCancellation(error)) throw error;
    }
    this.ui.display('\nРабота завершена. Сохранённые операции останутся доступны при следующем запуске.');
  }

  private async showMainMenu(): Promise<void> {
    const accounts = await this.accounts.listAccounts();
    if (accounts.length === 0) this.ui.display('Счетов пока нет. Создайте первый счёт.\n');
    const choices: Choice<MainAction>[] = accounts.map(account => ({
      name: `${account.name} — ${formatMoney(account.balanceMinor)} [${account.id}]`,
      value: { type: 'open', id: account.id },
    }));
    choices.push({ name: '+ Создать счёт', value: { type: 'create' } }, { name: 'Выход', value: { type: 'exit' } });
    const action = await this.ui.select('Главное меню', choices);
    switch (action.type) {
      case 'create': {
        const name = await this.ui.input('Название счёта:', asValidator(validateName));
        const account = await this.accounts.createAccount(name);
        this.notice = `Счёт «${account.name}» создан.`;
        break;
      }
      case 'open': this.selectedAccountId = action.id; break;
      case 'exit': this.running = false; break;
    }
  }

  private async showAccount(id: AccountId): Promise<void> {
    const account = await this.accounts.getAccount(id);
    this.ui.display(`${account.name}\nID: ${account.id}\nБаланс: ${formatMoney(account.balanceMinor)}\n`);
    if (account.transactions.length === 0) this.ui.display('Транзакций пока нет.');
    for (const transaction of account.transactions) this.ui.display(formatTransaction(transaction));
    this.ui.display('');
    const action = await this.ui.select<AccountAction>('Действия со счётом', [
      { name: 'Добавить транзакцию', value: 'add' },
      { name: 'Удалить транзакцию', value: 'delete-transaction' },
      { name: 'Экспортировать в CSV', value: 'export' },
      { name: 'Удалить счёт', value: 'delete-account' },
      { name: '← Главное меню', value: 'back' },
    ]);
    switch (action) {
      case 'add': await this.addTransaction(id); break;
      case 'delete-transaction': await this.deleteTransaction(account); break;
      case 'export': this.notice = `CSV сохранён: ${await this.exporter.export(account)}`; break;
      case 'delete-account': await this.deleteAccount(account); break;
      case 'back': this.selectedAccountId = undefined; break;
    }
  }

  private async addTransaction(accountId: AccountId): Promise<void> {
    const type = await this.ui.select<TransactionType>('Тип транзакции', [
      { name: 'Доход', value: TransactionType.Income },
      { name: 'Расход', value: TransactionType.Expense },
    ]);
    const amount = await this.ui.input('Сумма в рублях (например, 1250,50):', asValidator(parseAmount));
    const date = await this.ui.input('Дата (ГГГГ-ММ-ДД):', asValidator(validateDate), today());
    const category = await this.ui.input('Категория:', asValidator(validateCategory));
    const note = await this.ui.input('Комментарий (необязательно):', asValidator(validateNote));
    const input: TransactionInput = {
      type, amountMinor: parseAmount(amount), date: validateDate(date),
      category: validateCategory(category), note: validateNote(note),
    };
    this.ui.display(`${type === TransactionType.Income ? 'Доход' : 'Расход'}: ${formatMoney(input.amountMinor)} | ${input.date} | ${input.category}`);
    if (await this.ui.confirm('Сохранить транзакцию?')) {
      await this.transactions.addTransaction(accountId, input);
      this.notice = 'Транзакция добавлена.';
    } else this.notice = 'Добавление отменено.';
  }

  private async deleteTransaction(account: IAccount): Promise<void> {
    if (account.transactions.length === 0) {
      this.notice = 'Нет транзакций для удаления.';
      return;
    }
    const choices: Choice<string | null>[] = account.transactions.map(transaction => ({
      name: `${formatTransaction(transaction)} [${transaction.id}]`, value: transaction.id,
    }));
    choices.push({ name: '← Назад', value: null });
    const id = await this.ui.select('Какую транзакцию удалить?', choices);
    if (id === null) return;
    if (await this.ui.confirm('Удалить выбранную транзакцию?')) {
      await this.transactions.deleteTransaction(account.id, id);
      this.notice = 'Транзакция удалена.';
    } else this.notice = 'Удаление отменено.';
  }

  private async deleteAccount(account: IAccount): Promise<void> {
    if (await this.ui.confirm(`Удалить счёт «${account.name}» и все его транзакции (${account.transactions.length})?`)) {
      await this.accounts.deleteAccount(account.id);
      this.selectedAccountId = undefined;
      this.notice = 'Счёт и все его транзакции удалены.';
    } else this.notice = 'Удаление отменено.';
  }

  private isCancellation(error: unknown): boolean {
    return error instanceof Error && ['ExitPromptError', 'AbortPromptError'].includes(error.name);
  }
}
