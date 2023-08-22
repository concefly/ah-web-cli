export abstract class BaseCommand {
  abstract run(...args: any[]): Promise<void>;
}
