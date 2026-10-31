import inquirer from 'inquirer';
import type { Choice, InputValidator, IUserInterface } from './ports.js';

export class InquirerUserInterface implements IUserInterface {
  public async select<T>(message: string, choices: readonly Choice<T>[]): Promise<T> {
    const answer = await inquirer.prompt<{ value: T }>([{
      type: 'list', name: 'value', message, choices: [...choices], pageSize: 12,
    }]);
    return answer.value;
  }

  public async input(message: string, validate?: InputValidator, initial?: string): Promise<string> {
    const answer = await inquirer.prompt<{ value: string }>([{
      type: 'input', name: 'value', message,
      ...(validate === undefined ? {} : { validate }),
      ...(initial === undefined ? {} : { default: initial }),
    }]);
    return answer.value;
  }

  public async confirm(message: string): Promise<boolean> {
    const answer = await inquirer.prompt<{ value: boolean }>([{
      type: 'confirm', name: 'value', message, default: false,
    }]);
    return answer.value;
  }

  public display(message: string): void {
    console.log(message);
  }

  public clear(): void {
    console.clear();
  }
}
