import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { Account } from '../dist/domain/finance/Account.js';
import { Transaction } from '../dist/domain/finance/Transaction.js';
import { AccountManager } from '../dist/application/finance/AccountManager.js';
import { JsonAccountRepository } from '../dist/infrastructure/files/JsonAccountRepository.js';
import { CsvAccountExporter } from '../dist/infrastructure/files/CsvAccountExporter.js';

const input = {
  type: 'income', amountMinor: 10010, date: '2026-10-31', category: 'Зарплата', note: '',
};

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'budget-files-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function storedAccount(overrides = {}) {
  return {
    id: 'account-1', name: 'Основной',
    transactions: [{ id: 'transaction-1', ...input }], ...overrides,
  };
}

test('test_repository_missing_file_returns_empty_accounts_without_creating_file', async (t) => {
  const directory = await temporaryDirectory(t);
  assert.deepEqual(await new JsonAccountRepository(join(directory, 'new', 'accounts.json')).load(), []);
  assert.deepEqual(await readdir(directory), []);
});

test('test_repository_account_and_transaction_lifecycle_survives_new_instances', async (t) => {
  const directory = await temporaryDirectory(t);
  const file = join(directory, 'data', 'accounts.json');
  let sequence = 0;
  const ids = () => `id-${++sequence}`;
  const manager = () => new AccountManager(new JsonAccountRepository(file), ids);

  const first = await manager().createAccount('Основной');
  const second = await manager().createAccount('Сбережения');
  const income = await manager().addTransaction(first.id, input);
  await manager().addTransaction(first.id, { ...input, type: 'expense', amountMinor: 1010 });

  const loaded = await manager().getAccount(first.id);
  assert.equal(loaded.name, 'Основной');
  assert.equal(loaded.balanceMinor, 9000);
  assert.equal(loaded.transactions.length, 2);
  const persisted = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(persisted.version, 1);
  assert.equal('balanceMinor' in persisted.accounts[0], false);

  await manager().deleteTransaction(first.id, income.id);
  assert.equal((await manager().getAccount(first.id)).balanceMinor, -1010);
  await manager().deleteAccount(first.id);
  assert.deepEqual((await manager().listAccounts()).map((account) => account.id), [second.id]);
  await manager().deleteAccount(second.id);
  assert.deepEqual(await manager().listAccounts(), []);
  assert.deepEqual(await readdir(join(directory, 'data')), ['accounts.json']);
});

const corruptDocuments = [
  ['invalid JSON', '{broken'],
  ['null root', 'null'],
  ['array root', '[]'],
  ['unknown version', JSON.stringify({ version: 2, accounts: [] })],
  ['missing accounts', JSON.stringify({ version: 1 })],
  ['invalid accounts', JSON.stringify({ version: 1, accounts: {} })],
  ['null account', JSON.stringify({ version: 1, accounts: [null] })],
  ['invalid account id', JSON.stringify({ version: 1, accounts: [storedAccount({ id: '../x' })] })],
  ['invalid account name type', JSON.stringify({ version: 1, accounts: [storedAccount({ name: 10 })] })],
  ['missing transaction array', JSON.stringify({ version: 1, accounts: [storedAccount({ transactions: null })] })],
  ['null transaction', JSON.stringify({ version: 1, accounts: [storedAccount({ transactions: [null] })] })],
  ['duplicate accounts', JSON.stringify({ version: 1, accounts: [storedAccount(), storedAccount()] })],
  ['duplicate transactions', JSON.stringify({ version: 1, accounts: [storedAccount({
    transactions: [{ id: 'same', ...input }, { id: 'same', ...input }],
  })] })],
  ['duplicate transaction across accounts', JSON.stringify({ version: 1, accounts: [
    storedAccount(), storedAccount({ id: 'account-2' }),
  ] })],
  ...[
    { id: 1 }, { type: 'refund' }, { amountMinor: '100' }, { amountMinor: 0 },
    { amountMinor: 0.1 }, { date: '2026-02-30' }, { date: null },
    { category: [] }, { category: '   ' }, { note: null },
  ].map((overrides) => [JSON.stringify(overrides), JSON.stringify({
    version: 1, accounts: [storedAccount({ transactions: [{ id: 't-1', ...input, ...overrides }] })],
  })]),
];

for (const [scenario, contents] of corruptDocuments) {
  test(`test_repository_corrupt_${scenario}_reports_error_and_preserves_original`, async (t) => {
    const directory = await temporaryDirectory(t);
    const file = join(directory, 'accounts.json');
    await writeFile(file, contents);
    const repository = new JsonAccountRepository(file);
    await assert.rejects(repository.load(), /[а-яё]/i);
    const manager = new AccountManager(repository, () => 'new-id');
    await assert.rejects(manager.createAccount('Новый'), /[а-яё]/i);
    assert.equal(await readFile(file, 'utf8'), contents);
  });
}

test('test_repository_read_error_is_not_treated_as_empty_storage', async (t) => {
  const directory = await temporaryDirectory(t);
  await assert.rejects(new JsonAccountRepository(directory).load(), /[а-яё]/i);
});

test('test_repository_failed_save_preserves_destination_and_cleans_temporary_files', async (t) => {
  const directory = await temporaryDirectory(t);
  const destination = join(directory, 'accounts.json');
  await mkdir(destination);
  await writeFile(join(destination, 'keep.txt'), 'сохранить');
  await assert.rejects(new JsonAccountRepository(destination).save([new Account('a-1', 'Счёт')]), /[а-яё]/i);
  assert.equal(await readFile(join(destination, 'keep.txt'), 'utf8'), 'сохранить');
  assert.deepEqual(await readdir(directory), ['accounts.json']);
});

test('test_repository_parent_is_file_reports_save_error_without_modification', async (t) => {
  const directory = await temporaryDirectory(t);
  const blocked = join(directory, 'blocked');
  await writeFile(blocked, 'сохранить');
  await assert.rejects(new JsonAccountRepository(join(blocked, 'accounts.json')).save([]), /[а-яё]/i);
  assert.equal(await readFile(blocked, 'utf8'), 'сохранить');
});

test('test_csv_cyrillic_quotes_commas_and_multiline_notes_are_preserved', async (t) => {
  const directory = await temporaryDirectory(t);
  const account = new Account('a-1', 'Счёт, "основной"', [
    new Transaction('t-1', { ...input, category: 'Дом, еда', note: 'Первая "строка"\r\nВторая\nТретья' }),
    new Transaction('t-2', { ...input, type: 'expense', amountMinor: 1, note: 'Расход' }),
  ]);
  const file = await new CsvAccountExporter(join(directory, 'exports')).export(account);
  const csv = await readFile(file, 'utf8');

  assert.equal(isAbsolute(file), true);
  assert.equal(csv, '\uFEFF"ID счёта","Счёт","ID транзакции","Тип","Сумма RUB","Дата","Категория","Комментарий"\r\n'
    + '"a-1","Счёт, ""основной""","t-1","Доход","100.10","2026-10-31","Дом, еда","Первая ""строка""\r\nВторая\nТретья"\r\n'
    + '"a-1","Счёт, ""основной""","t-2","Расход","0.01","2026-10-31","Зарплата","Расход"\r\n');
});

for (const dangerous of ['=1+1', '+cmd', '-cmd', '@SUM(A1)', ' \t=1+1', '\n@x']) {
  test(`test_csv_formula_${JSON.stringify(dangerous)}_is_exported_as_text`, async (t) => {
    const directory = await temporaryDirectory(t);
    const account = {
      id: 'a-1', name: '=Опасный', balanceMinor: input.amountMinor,
      transactions: [{ id: 't-1', ...input, category: '+Категория', note: dangerous }],
    };
    const csv = await readFile(await new CsvAccountExporter(directory).export(account), 'utf8');
    assert.ok(csv.includes('"\'=Опасный"'));
    assert.ok(csv.includes('"\'+Категория"'));
    assert.ok(csv.includes(`"'${dangerous}"`));
    assert.ok(csv.includes('"100.10"'));
  });
}

test('test_csv_empty_account_has_header_only_and_repeated_exports_are_unique', async (t) => {
  const directory = await temporaryDirectory(t);
  const exporter = new CsvAccountExporter(directory);
  const account = new Account('a-1', 'Пустой');
  const first = await exporter.export(account);
  const second = await exporter.export(account);
  assert.notEqual(first, second);
  assert.equal((await readFile(first, 'utf8')).split('\r\n').length, 2);
  assert.equal(await readFile(first, 'utf8'), await readFile(second, 'utf8'));
});

test('test_csv_large_amount_keeps_two_exact_decimal_places', async (t) => {
  const directory = await temporaryDirectory(t);
  const account = new Account('a-1', 'Счёт', [new Transaction('t-1', { ...input, amountMinor: 999999999999 })]);
  const csv = await readFile(await new CsvAccountExporter(directory).export(account), 'utf8');
  assert.ok(csv.includes('"9999999999.99"'));
});

test('test_csv_parent_is_file_reports_error_without_modification', async (t) => {
  const directory = await temporaryDirectory(t);
  const blocked = join(directory, 'blocked');
  await writeFile(blocked, 'сохранить');
  await assert.rejects(new CsvAccountExporter(blocked).export(new Account('a-1', 'Счёт')), /[а-яё]/i);
  assert.equal(await readFile(blocked, 'utf8'), 'сохранить');
});
