import { TransactionType } from '../../domain/finance/types.js';
import type { ITransaction } from '../../domain/finance/types.js';
import type { InputValidator } from './ports.js';

const rubleFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

export function formatMoney(amountMinor: number): string {
  const absolute = BigInt(Math.abs(amountMinor));
  const rubles = rubleFormatter.format(absolute / 100n);
  const kopecks = String(absolute % 100n).padStart(2, '0');
  return `${amountMinor < 0 ? '-' : ''}${rubles},${kopecks}\u00a0₽`;
}

export function formatTransaction(transaction: ITransaction): string {
  const sign = transaction.type === TransactionType.Income ? '+' : '-';
  const note = transaction.note ? ` | ${transaction.note.replace(/[\r\n\t]+/g, ' ')}` : '';
  return `${transaction.date} | ${sign}${formatMoney(transaction.amountMinor)} | ${transaction.category}${note}`;
}

export function asValidator(parse: (value: string) => unknown): InputValidator {
  return (value: string): true | string => {
    try {
      parse(value);
      return true;
    } catch (error: unknown) {
      return error instanceof Error ? error.message : 'Некорректные данные.';
    }
  };
}

export function today(date: Date = new Date()): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
