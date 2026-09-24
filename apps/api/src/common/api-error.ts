import { HttpException } from '@nestjs/common';
import type { ApiErrorBody } from '@petjada/shared';

export type ApiErrorCode = ApiErrorBody['code'];

/** Excepció HTTP amb un codi estable que el client sap interpretar. */
export class ApiError extends HttpException {
  constructor(
    public readonly statusCode: number,
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super({ statusCode, code, message } satisfies ApiErrorBody, statusCode);
  }

  toBody(): ApiErrorBody {
    return { statusCode: this.statusCode, code: this.code, message: this.message };
  }
}
