export const MAX_AMOUNT_MINOR = 1_000_000_000_000;

export function parseAmount(value: string): number {
  if (typeof value !== 'string' || !/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) {
    throw new Error('Введите положительную сумму в рублях, не более двух знаков после запятой.');
  }
  const [rubles = '0', kopecks = ''] = value.trim().split(/[.,]/);
  const amountMinor = BigInt(rubles) * 100n + BigInt(kopecks.padEnd(2, '0'));
  if (amountMinor <= 0n || amountMinor > BigInt(MAX_AMOUNT_MINOR)) {
    throw new Error('Сумма должна быть больше нуля и не превышать 10 000 000 000 рублей.');
  }
  return Number(amountMinor);
}

export function validateDate(value: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Введите дату в формате ГГГГ-ММ-ДД.');
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const days = daysPerMonth[month - 1];
  if (year === 0 || days === undefined || day < 1 || day > days) {
    throw new Error('Укажите существующую календарную дату (год от 0001 до 9999).');
  }
  return value;
}

function validateText(value: string, label: string, maximum: number, allowEmpty = false, multiline = false): string {
  const controls = multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/ : /[\u0000-\u001F\u007F-\u009F]/;
  if (typeof value !== 'string' || controls.test(value)) {
    throw new Error(`${label}: недопустимый текст или управляющие символы.`);
  }
  const trimmed = value.trim();
  if ((!allowEmpty && trimmed.length === 0) || trimmed.length > maximum) {
    throw new Error(`${label}: длина должна быть от ${allowEmpty ? 0 : 1} до ${maximum} символов.`);
  }
  return trimmed;
}

export function validateName(value: string): string {
  return validateText(value, 'Название счёта', 80);
}

export function validateCategory(value: string): string {
  return validateText(value, 'Категория', 60);
}

export function validateNote(value: string): string {
  return validateText(value, 'Примечание', 250, true, true);
}

export function validateId(value: string): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(value)) {
    throw new Error('Идентификатор должен содержать от 1 до 100 латинских букв, цифр или дефисов.');
  }
  return value;
}
