export class PermanentOutboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentOutboxError";
  }
}
