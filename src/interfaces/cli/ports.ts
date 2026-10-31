export interface Choice<T> {
  readonly name: string;
  readonly value: T;
}

export type InputValidator = (value: string) => true | string;

export interface IUserInterface {
  select<T>(message: string, choices: readonly Choice<T>[]): Promise<T>;
  input(message: string, validate?: InputValidator, initial?: string): Promise<string>;
  confirm(message: string): Promise<boolean>;
  display(message: string): void;
  clear(): void;
}
