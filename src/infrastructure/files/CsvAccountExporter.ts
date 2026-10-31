import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { IAccountExporter } from '../../application/finance/ports.js';
import { TransactionType, type IAccount } from '../../domain/finance/types.js';

function quoteText(value: string): string {
  const safeText = /^\s*[=+\-@]/u.test(value) ? `'${value}` : value;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function formatAmount(amountMinor: number): string {
  return `${Math.floor(amountMinor / 100)}.${String(amountMinor % 100).padStart(2, '0')}`;
}

export class CsvAccountExporter implements IAccountExporter {
  private readonly directory: string;

  public constructor(directory: string) {
    this.directory = resolve(directory);
  }

  public async export(account: IAccount): Promise<string> {
    const rows = [[
      'ID счёта', 'Счёт', 'ID транзакции', 'Тип', 'Сумма RUB', 'Дата', 'Категория', 'Комментарий',
    ].map(quoteText).join(',')];
    for (const transaction of account.transactions) {
      rows.push([
        quoteText(account.id),
        quoteText(account.name),
        quoteText(transaction.id),
        quoteText(transaction.type === TransactionType.Income ? 'Доход' : 'Расход'),
        `"${formatAmount(transaction.amountMinor)}"`,
        quoteText(transaction.date),
        quoteText(transaction.category),
        quoteText(transaction.note),
      ].join(','));
    }
    const safeId = account.id.replace(/[^a-zA-Z0-9-]/g, '_');
    const filePath = join(this.directory, `account-${safeId}-${randomUUID()}.csv`);
    try {
      await mkdir(this.directory, { recursive: true });
      await writeFile(filePath, `\uFEFF${rows.join('\r\n')}\r\n`, { encoding: 'utf8', flag: 'wx' });
      return filePath;
    } catch (error: unknown) {
      throw new Error(`Не удалось экспортировать CSV: ${filePath}.`, { cause: error });
    }
  }
}
