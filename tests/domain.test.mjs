import assert from 'node:assert/strict';
import test from 'node:test';
import { Account } from '../dist/domain/finance/Account.js';
import { Transaction } from '../dist/domain/finance/Transaction.js';
import { TransactionType } from '../dist/domain/finance/types.js';
import {
  MAX_AMOUNT_MINOR, parseAmount, validateDate, validateName, validateCategory, validateNote,
} from '../dist/domain/finance/validation.js';

const input = (changes = {}) => ({
  type: TransactionType.Income, amountMinor: 12500, date: '2026-10-31',
  category: 'Зарплата', note: '', ...changes,
});

for (const [value, expected] of [['0.01', 1], ['12,34', 1234], ['10', 1000], [' 10.5 ', 1050], ['0,10', 10], ['10000000000', 1_000_000_000_000]]) {
  test(`test_parseAmount_valid_${value}_returns_exact_kopecks`, () => {
    assert.equal(parseAmount(value), expected);
  });
}

for (const value of ['', ' ', '0', '0.00', '-1', '+1', '.5', '1.', '1.001', '1e3', 'NaN', 'Infinity', '12abc', '1,2.3', '1 000', '10000000000.01', '900719925474099100', 1, null]) {
  test(`test_parseAmount_invalid_${String(value)}_rejects`, () => {
    assert.throws(() => parseAmount(value), /сумм/i);
  });
}

for (const value of ['2024-02-29', '2000-02-29', '0001-01-01', '9999-12-31', '2026-10-31']) {
  test(`test_validateDate_real_${value}_returns_date`, () => {
    assert.equal(validateDate(value), value);
  });
}

for (const value of ['2023-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-01-00', '0000-01-01', '2026-13-01', '2026-1-1', '31.10.2026', '2026-10-31T00:00:00Z', ' 2026-10-31 ', null]) {
  test(`test_validateDate_invalid_${String(value)}_rejects`, () => {
    assert.throws(() => validateDate(value), /дат/i);
  });
}

test('test_text_valid_values_are_trimmed_and_limits_inclusive', () => {
  assert.equal(validateName(' Основной '), 'Основной');
  assert.equal(validateName('я'.repeat(80)).length, 80);
  assert.equal(validateCategory(' Еда '), 'Еда');
  assert.equal(validateCategory('я'.repeat(60)).length, 60);
  assert.equal(validateNote(' Заметка\nстрока\t2 '), 'Заметка\nстрока\t2');
  assert.equal(validateNote('я'.repeat(250)).length, 250);
  assert.equal(validateNote(''), '');
});

for (const [validator, value] of [
  [validateName, ''], [validateName, ' '.repeat(4)], [validateName, 'a'.repeat(81)],
  [validateName, 'счёт\n2'], [validateName, '\x1b[31m'], [validateName, null],
  [validateCategory, ''], [validateCategory, 'a'.repeat(61)], [validateCategory, 'a\t'],
  [validateNote, 'a'.repeat(251)], [validateNote, 'a\x00b'], [validateNote, '\x1b[31m'],
]) {
  test(`test_${validator.name}_invalid_${JSON.stringify(value)}_rejects`, () => {
    assert.throws(() => validator(value));
  });
}

test('test_transaction_valid_input_is_immutable_and_normalized', () => {
  const original = input({ category: ' Зарплата ', note: ' Отпуск ' });
  const transaction = new Transaction('tx-1', original);
  original.amountMinor = 999;
  assert.equal(transaction.amountMinor, 12500);
  assert.equal(transaction.category, 'Зарплата');
  assert.equal(transaction.note, 'Отпуск');
  assert.throws(() => { transaction.amountMinor = 999; }, TypeError);
});

for (const changes of [
  { type: 'invalid' }, { amountMinor: 0 }, { amountMinor: -1 }, { amountMinor: 1.5 },
  { amountMinor: NaN }, { amountMinor: Infinity }, { amountMinor: '100' },
  { amountMinor: 1_000_000_000_001 }, { date: '2026-02-30' }, { category: '' }, { note: null },
]) {
  test(`test_transaction_invalid_${JSON.stringify(changes)}_rejects`, () => {
    assert.throws(() => new Transaction('tx-1', input(changes)));
  });
}

for (const id of ['', 'with space', '../file', 'a/b', 'а', 'x'.repeat(101), null]) {
  test(`test_entity_invalid_id_${JSON.stringify(id)}_rejects`, () => {
    assert.throws(() => new Transaction(id, input()), /идентификатор/i);
    assert.throws(() => new Account(id, 'Основной'), /идентификатор/i);
  });
}

test('test_transaction_null_input_rejects_with_actionable_error', () => {
  assert.throws(() => new Transaction('tx-1', null), /транзакц/i);
});

test('test_account_add_delete_transactions_updates_balance', () => {
  const account = new Account('account-1', ' Основной ');
  assert.equal(account.name, 'Основной');
  assert.equal(account.balanceMinor, 0);
  account.addTransaction(new Transaction('income', input()));
  account.addTransaction(new Transaction('expense', input({ type: TransactionType.Expense, amountMinor: 15000 })));
  assert.equal(account.balanceMinor, -2500);
  account.deleteTransaction('expense');
  assert.equal(account.balanceMinor, 12500);
  assert.deepEqual(account.transactions.map(({ id }) => id), ['income']);
});

test('test_account_external_mutation_does_not_change_invariants', () => {
  const original = { id: 'tx-1', ...input() };
  const source = [original];
  const account = new Account('account-1', 'Основной', source);
  source.length = 0;
  original.amountMinor = 5;
  const returned = account.transactions;
  returned.length = 0;
  assert.equal(account.transactions.length, 1);
  assert.equal(account.balanceMinor, 12500);
  assert.throws(() => { account.transactions[0].amountMinor = 3; }, TypeError);
  assert.throws(() => { account.id = 'another'; }, TypeError);
});

test('test_account_duplicate_or_missing_transaction_preserves_state', () => {
  const transaction = new Transaction('tx-1', input());
  const account = new Account('account-1', 'Основной', [transaction]);
  assert.throws(() => account.addTransaction(transaction), /уже|повтор/i);
  assert.throws(() => account.deleteTransaction('missing'), /не найдена/i);
  assert.equal(account.balanceMinor, 12500);
  assert.throws(() => new Account('account-2', 'Второй', [transaction, transaction]), /уже|повтор/i);
});

test('test_account_invalid_transaction_collection_rejects_with_actionable_error', () => {
  assert.throws(() => new Account('account-1', 'Основной', null), /списком/i);
});

test('test_account_unsafe_balance_addition_is_rejected_without_mutation', () => {
  const transactions = Array.from({ length: 9007 }, (_, index) => new Transaction(`tx-${index}`, input({ amountMinor: MAX_AMOUNT_MINOR })));
  const account = new Account('account-1', 'Основной', transactions);
  const before = account.balanceMinor;
  assert.throws(() => account.addTransaction(new Transaction('overflow', input({ amountMinor: MAX_AMOUNT_MINOR }))), /баланс/i);
  assert.equal(account.balanceMinor, before);
  assert.equal(account.transactions.length, 9007);
  assert.throws(() => new Account('account-2', 'Накопления', [
    ...transactions, new Transaction('overflow', input({ amountMinor: MAX_AMOUNT_MINOR })),
  ]), /баланс/i);
});

test('test_account_unsafe_balance_deletion_is_rejected_without_mutation', () => {
  const transactions = [new Transaction('expense', input({ type: TransactionType.Expense, amountMinor: MAX_AMOUNT_MINOR }))];
  transactions.push(...Array.from({ length: 9008 }, (_, index) => new Transaction(`tx-${index}`, input({ amountMinor: MAX_AMOUNT_MINOR }))));
  const account = new Account('account-1', 'Основной', transactions);
  assert.throws(() => account.deleteTransaction('expense'), /баланс/i);
  assert.equal(account.transactions.length, 9009);
});
