import assert from 'node:assert/strict';
import test from 'node:test';
import { AccountManager } from '../dist/application/finance/AccountManager.js';
import { Account } from '../dist/domain/finance/Account.js';
import { Transaction } from '../dist/domain/finance/Transaction.js';
import { TransactionType } from '../dist/domain/finance/types.js';

const input = { type: TransactionType.Income, amountMinor: 12345, date: '2026-10-31', category: 'Зарплата', note: '' };

class MemoryRepository {
  accounts = [];
  failSave = false;

  async load() { return this.accounts; }
  async save(accounts) {
    if (this.failSave) throw new Error('Нет места на диске');
    this.accounts = accounts;
  }
}

function setup() {
  const repository = new MemoryRepository();
  let id = 0;
  const manager = new AccountManager(repository, () => `id-${++id}`);
  return { repository, manager };
}

test('test_manager_account_lifecycle_persists_expected_business_state', async () => {
  const { repository, manager } = setup();
  assert.deepEqual(await manager.listAccounts(), []);
  const account = await manager.createAccount(' Основной ');
  const second = await manager.createAccount('Накопления');
  assert.equal(account.name, 'Основной');
  assert.notEqual(account.id, second.id);
  assert.equal((await manager.getAccount(account.id)).balanceMinor, 0);
  assert.equal((await manager.listAccounts()).length, 2);
  const transaction = await manager.addTransaction(account.id, input);
  assert.equal((await manager.getAccount(account.id)).balanceMinor, 12345);
  await manager.deleteTransaction(account.id, transaction.id);
  assert.equal((await manager.getAccount(account.id)).balanceMinor, 0);
  await manager.addTransaction(account.id, input);
  await manager.deleteAccount(account.id);
  assert.deepEqual(repository.accounts.map(({ id }) => id), [second.id]);
  await assert.rejects(manager.getAccount(account.id), /счёт.*не найден/i);
});

test('test_manager_list_reads_current_repository_state', async () => {
  const { repository, manager } = setup();
  assert.equal((await manager.listAccounts()).length, 0);
  repository.accounts = [new Account('external', 'Внешний')];
  assert.equal((await manager.listAccounts())[0].id, 'external');
});

test('test_manager_repository_results_are_protected_from_client_mutation', async () => {
  const { repository, manager } = setup();
  await manager.createAccount('Основной');
  const accounts = await manager.listAccounts();
  accounts.length = 0;
  assert.equal(repository.accounts.length, 1);
});

test('test_manager_missing_account_or_transaction_does_not_change_state', async () => {
  const { repository, manager } = setup();
  const account = await manager.createAccount('Основной');
  for (const operation of [
    () => manager.getAccount('missing'),
    () => manager.deleteAccount('missing'),
    () => manager.addTransaction('missing', input),
    () => manager.deleteTransaction('missing', 'tx-1'),
  ]) await assert.rejects(operation(), /счёт.*не найден/i);
  await assert.rejects(manager.deleteTransaction(account.id, 'missing'), /транзакция.*не найдена/i);
  assert.equal(repository.accounts.length, 1);
  assert.equal(repository.accounts[0].transactions.length, 0);
});

test('test_manager_invalid_input_leaves_repository_unchanged', async () => {
  const { repository, manager } = setup();
  await assert.rejects(manager.createAccount(''), /назван/i);
  const account = await manager.createAccount('Основной');
  await assert.rejects(manager.addTransaction(account.id, { ...input, amountMinor: -100 }), /сумм/i);
  assert.equal(repository.accounts.length, 1);
  assert.equal(repository.accounts[0].transactions.length, 0);
});

test('test_manager_colliding_identifiers_reject_without_overwriting', async () => {
  const repository = new MemoryRepository();
  const manager = new AccountManager(repository, () => 'same-id');
  const account = await manager.createAccount('Основной');
  await assert.rejects(manager.createAccount('Другой'), /идентификатор.*уже|уникальн/i);
  await manager.addTransaction(account.id, input);
  await assert.rejects(manager.addTransaction(account.id, input), /уже|повтор/i);
  assert.equal(repository.accounts.length, 1);
  assert.equal(repository.accounts[0].transactions.length, 1);
});

test('test_manager_transaction_id_collision_across_accounts_rejects_without_saving', async () => {
  const repository = new MemoryRepository();
  repository.accounts = [
    new Account('account-1', 'Основной', [new Transaction('same-id', input)]),
    new Account('account-2', 'Накопления'),
  ];
  const manager = new AccountManager(repository, () => 'same-id');
  await assert.rejects(manager.addTransaction('account-2', input), /уже|повтор/i);
  assert.equal(repository.accounts[1].transactions.length, 0);
});

for (const operation of ['create', 'delete-account', 'add-transaction', 'delete-transaction']) {
  test(`test_manager_${operation}_save_failure_preserves_loaded_state`, async () => {
    const { repository, manager } = setup();
    const account = new Account('account-1', 'Основной', [new Transaction('tx-1', input)]);
    repository.accounts = [account];
    repository.failSave = true;
    const actions = {
      create: () => manager.createAccount('Новый'),
      'delete-account': () => manager.deleteAccount(account.id),
      'add-transaction': () => manager.addTransaction(account.id, input),
      'delete-transaction': () => manager.deleteTransaction(account.id, 'tx-1'),
    };
    await assert.rejects(actions[operation](), /Нет места/);
    assert.equal(repository.accounts.length, 1);
    assert.equal(account.transactions.length, 1);
    assert.equal(account.balanceMinor, 12345);
  });
}

test('test_manager_create_resolves_only_after_save_finishes', async () => {
  let finishSave;
  let saved = false;
  const repository = {
    load: async () => [],
    save: async () => { await new Promise((resolve) => { finishSave = resolve; }); saved = true; },
  };
  const manager = new AccountManager(repository, () => 'account-1');
  let resolved = false;
  const pending = manager.createAccount('Основной').then(() => { resolved = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolved, false);
  finishSave();
  await pending;
  assert.equal(saved, true);
});
