export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: { path: string; message: string }[];

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}
