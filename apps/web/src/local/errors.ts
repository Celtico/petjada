import type { ApiErrorBody, ApiErrorCode } from '@petjada/shared';

/** Error del backend local amb la mateixa forma que el cos d'error de l'API. */
export class LocalApiError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;

  constructor(statusCode: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'LocalApiError';
    this.statusCode = statusCode;
    this.code = code;
  }

  toBody(): ApiErrorBody {
    return { statusCode: this.statusCode, code: this.code, message: this.message };
  }
}
