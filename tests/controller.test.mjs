import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ApplicationController } from '../dist/interfaces/cli/ApplicationController.js';
import { AccountManager } from '../dist/application/finance/AccountManager.js';
import { JsonAccountRepository } from '../dist/infrastructure/files/JsonAccountRepository.js';
import { CsvAccountExporter } from '../dist/infrastructure/files/CsvAccountExporter.js';
import { asValidator, formatMoney, formatTransaction, today } from '../dist/interfaces/cli/formatting.js';

class ScriptedUi {
  messages = [];
  clearCount = 0;
  constructor(selections = [], inputs = [], confirmations = []) {
    this.selections = [...selections];
    this.inputs = [...inputs];
    this.confirmations = [...confirmations];
  }
  async select(message, choices) {
    assert.ok(this.selections.length, `No scripted selection: ${message}`);
    const value = this.selections.shift();
    if (value instanceof Error) throw value;
    assert.ok(choices.some(choice => JSON.stringify(choice.value) === JSON.stringify(value)), `Unavailable choice: ${JSON.stringify(value)}`);
    return value;
  }
  async input(message, validate) {
    assert.ok(this.inputs.length, `No scripted input: ${message}`);
    const value = this.inputs.shift();
    assert.equal(validate?.(value) ?? true, true);
    return value;
  }
  async confirm(message) {
    assert.ok(this.confirmations.length, `No scripted confirmation: ${message}`);
    return this.confirmations.shift();
  }
  display(message) { this.messages.push(message); }
  clear() { this.clearCount += 1; }
}

async function fixture(t, ui) {
  const dir = await mkdtemp(join(tmpdir(), 'budget-controller-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const repository = new JsonAccountRepository(join(dir, 'accounts.json'));
  let id = 0;
  const manager = new AccountManager(repository, () => `id-${++id}`);
  const exporter = new CsvAccountExporter(join(dir, 'exports'));
  return { manager, repository, dir, controller: new ApplicationController(manager, manager, exporter, ui) };
}

const open = id => ({ type: 'open', id });
const exit = { type: 'exit' };
const draft = { type: 'income', amountMinor: 10010, date: '2026-10-31', category: 'Зарплата', note: '' };

test('test_controller_full_finance_flow_saves_and_exports_exact_balance', async t => {
  const ui = new ScriptedUi([
    { type: 'create' }, open('id-1'), 'add', 'income', 'add', 'expense', 'export', 'back', exit,
  ], ['Карта', '100,10', '2026-10-31', 'Зарплата', '', '0.20', '2026-10-31', 'Еда', 'Чай'], [true, true]);
  const { manager, controller } = await fixture(t, ui);
  await controller.run();
  const account = await manager.getAccount('id-1');
  assert.equal(account.balanceMinor, 9990);
  assert.equal(account.transactions.length, 2);
  const message = ui.messages.find(value => value.startsWith('CSV сохранён: '));
  assert.ok(message);
  const csv = await readFile(message.slice('CSV сохранён: '.length), 'utf8');
  assert.match(csv, /100\.10/);
  assert.match(csv, /0\.20/);
  assert.ok(ui.clearCount >= 7);
  assert.ok(ui.messages.some(value => value.includes('99,90')));
});

test('test_controller_delete_transaction_declined_keeps_transaction', async t => {
  const ui = new ScriptedUi([open('id-1'), 'delete-transaction', 'id-2', 'back', exit], [], [false]);
  const { manager, controller } = await fixture(t, ui);
  const account = await manager.createAccount('Карта');
  await manager.addTransaction(account.id, draft);
  await controller.run();
  assert.equal((await manager.getAccount(account.id)).transactions.length, 1);
});

test('test_controller_delete_transaction_confirmed_removes_transaction', async t => {
  const ui = new ScriptedUi([open('id-1'), 'delete-transaction', 'id-2', 'back', exit], [], [true]);
  const { manager, controller } = await fixture(t, ui);
  await manager.createAccount('Карта');
  await manager.addTransaction('id-1', draft);
  await controller.run();
  assert.equal((await manager.getAccount('id-1')).transactions.length, 0);
});

test('test_controller_delete_account_declined_then_confirmed_obeys_confirmation', async t => {
  const ui = new ScriptedUi([open('id-1'), 'delete-account', 'delete-account', exit], [], [false, true]);
  const { manager, controller } = await fixture(t, ui);
  await manager.createAccount('Карта');
  await manager.addTransaction('id-1', draft);
  await controller.run();
  assert.deepEqual(await manager.listAccounts(), []);
  assert.ok(ui.messages.some(value => value.includes('Удаление отменено')));
});

test('test_controller_empty_transactions_and_back_selection_do_not_delete', async t => {
  const ui = new ScriptedUi([open('id-1'), 'delete-transaction', 'back', exit]);
  const { manager, controller } = await fixture(t, ui);
  await manager.createAccount('Пустой');
  await controller.run();
  assert.ok(ui.messages.some(value => value.includes('Нет транзакций для удаления')));
});

test('test_controller_transaction_selection_cancel_preserves_data', async t => {
  const ui = new ScriptedUi([open('id-1'), 'delete-transaction', null, 'back', exit]);
  const { manager, controller } = await fixture(t, ui);
  await manager.createAccount('Карта');
  await manager.addTransaction('id-1', draft);
  await controller.run();
  assert.equal((await manager.getAccount('id-1')).transactions.length, 1);
});

test('test_controller_add_transaction_cancel_does_not_save', async t => {
  const ui = new ScriptedUi([open('id-1'), 'add', 'expense', 'back', exit], ['12', '2026-10-31', 'Еда', ''], [false]);
  const { manager, controller } = await fixture(t, ui);
  await manager.createAccount('Карта');
  await controller.run();
  assert.equal((await manager.getAccount('id-1')).transactions.length, 0);
});

test('test_controller_storage_failure_shows_error_and_allows_exit', async t => {
  const ui = new ScriptedUi([], [], [false]);
  const { dir, controller } = await fixture(t, ui);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(dir, 'accounts.json'), '{broken');
  await controller.run();
  assert.ok(ui.messages.some(value => value.startsWith('Ошибка: ')));
  assert.equal(await readFile(join(dir, 'accounts.json'), 'utf8'), '{broken');
});

test('test_controller_prompt_cancel_exits_without_stack_trace', async t => {
  const error = new Error('cancel');
  error.name = 'ExitPromptError';
  const ui = new ScriptedUi([error]);
  const { controller } = await fixture(t, ui);
  await controller.run();
  assert.ok(ui.messages.some(value => value.includes('Работа завершена')));
});

test('test_formatting_values_preserve_money_and_validation_messages', () => {
  assert.match(formatMoney(-9990), /-99,90/);
  assert.match(formatTransaction({ ...draft, id: 't-1' }), /Зарплата/);
  assert.match(formatTransaction({ ...draft, id: 't-2', type: 'expense', note: 'Чай' }), /Чай/);
  assert.equal(asValidator(value => value.trim())('ok'), true);
  assert.equal(asValidator(() => { throw new Error('Некорректно'); })('bad'), 'Некорректно');
  assert.equal(asValidator(() => { throw 'bad'; })('bad'), 'Некорректные данные.');
  assert.equal(today(new Date(2026, 0, 2)), '2026-01-02');
});

for (const [amount, expected] of [
  [Number.MAX_SAFE_INTEGER, '90 071 992 547 409,91 ₽'],
  [-Number.MAX_SAFE_INTEGER, '-90 071 992 547 409,91 ₽'],
  [-1, '-0,01 ₽'],
  [0, '0,00 ₽'],
]) {
  test(`test_formatMoney_${amount}_preserves_every_kopeck`, () => {
    assert.equal(formatMoney(amount).replace(/\s/g, ' '), expected);
  });
}
