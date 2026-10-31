import { TransactionType } from './types.js';
import type { ITransaction, TransactionInput } from './types.js';
import { MAX_AMOUNT_MINOR, validateCategory, validateDate, validateId, validateNote } from './validation.js';

export class Transaction implements ITransaction {
  public readonly id: string;
  public readonly type: TransactionType;
  public readonly amountMinor: number;
  public readonly date: string;
  public readonly category: string;
  public readonly note: string;

  public constructor(id: string, input: TransactionInput) {
    this.id = validateId(id);
    if (typeof input !== 'object' || input === null) {
      throw new Error('Необходимо передать данные транзакции.');
    }
    if (input.type !== TransactionType.Income && input.type !== TransactionType.Expense) {
      throw new Error('Тип транзакции должен быть «доход» или «расход».');
    }
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 || input.amountMinor > MAX_AMOUNT_MINOR) {
      throw new Error('Сумма должна быть целым положительным числом копеек, не более 10 000 000 000 рублей.');
    }
    this.type = input.type;
    this.amountMinor = input.amountMinor;
    this.date = validateDate(input.date);
    this.category = validateCategory(input.category);
    this.note = validateNote(input.note);
    Object.freeze(this);
  }
}
