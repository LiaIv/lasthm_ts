import assert from 'node:assert/strict';
import test from 'node:test';
import inquirer from 'inquirer';
import { InquirerUserInterface } from '../dist/interfaces/cli/InquirerUserInterface.js';

test('test_inquirer_selection_returns_chosen_typed_value', async t => {
  const selected = { type: 'open', id: 'account-1' };
  t.mock.method(inquirer, 'prompt', async questions => {
    assert.equal(questions[0].type, 'list');
    assert.deepEqual(questions[0].choices[0].value, selected);
    return { value: selected };
  });
  assert.deepEqual(await new InquirerUserInterface().select('Счета', [{ name: 'Карта', value: selected }]), selected);
});

test('test_inquirer_input_passes_validation_and_default_to_prompt', async t => {
  const validator = value => value === '' ? 'Введите сумму' : true;
  t.mock.method(inquirer, 'prompt', async questions => {
    assert.equal(questions[0].type, 'input');
    assert.equal(questions[0].validate(''), 'Введите сумму');
    assert.equal(questions[0].default, '10');
    return { value: '20' };
  });
  assert.equal(await new InquirerUserInterface().input('Сумма', validator, '10'), '20');
});

test('test_inquirer_optional_input_has_no_undefined_options', async t => {
  t.mock.method(inquirer, 'prompt', async questions => {
    assert.equal(Object.hasOwn(questions[0], 'validate'), false);
    assert.equal(Object.hasOwn(questions[0], 'default'), false);
    return { value: '' };
  });
  assert.equal(await new InquirerUserInterface().input('Комментарий'), '');
});

test('test_inquirer_confirmation_defaults_to_safe_refusal', async t => {
  t.mock.method(inquirer, 'prompt', async questions => {
    assert.equal(questions[0].type, 'confirm');
    assert.equal(questions[0].default, false);
    return { value: false };
  });
  assert.equal(await new InquirerUserInterface().confirm('Удалить?'), false);
});

test('test_inquirer_display_and_clear_update_terminal', t => {
  const messages = [];
  let cleared = false;
  t.mock.method(console, 'log', value => messages.push(value));
  t.mock.method(console, 'clear', () => { cleared = true; });
  const ui = new InquirerUserInterface();
  ui.display('Баланс: 10');
  ui.clear();
  assert.deepEqual(messages, ['Баланс: 10']);
  assert.equal(cleared, true);
});
