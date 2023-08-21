export class FetchError extends Error {
  public code: number;
  public details: object;

  constructor(message: string, code: number, details: object) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
