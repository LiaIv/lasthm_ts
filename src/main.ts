import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { AccountManager } from './application/finance/AccountManager.js';
import { CsvAccountExporter } from './infrastructure/files/CsvAccountExporter.js';
import { JsonAccountRepository } from './infrastructure/files/JsonAccountRepository.js';
import { ApplicationController } from './interfaces/cli/ApplicationController.js';
import { InquirerUserInterface } from './interfaces/cli/InquirerUserInterface.js';

const ui = new InquirerUserInterface();
const repository = new JsonAccountRepository(resolve('data/accounts.json'));
const manager = new AccountManager(repository, randomUUID);
const exporter = new CsvAccountExporter(resolve('exports'));
const controller = new ApplicationController(manager, manager, exporter, ui);

try {
  await controller.run();
} catch (error: unknown) {
  ui.display(`Не удалось завершить операцию: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
  process.exitCode = 1;
}
