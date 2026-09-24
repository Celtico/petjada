import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorBody } from '@petjada/shared';
import { ApiError } from './api-error';

function codeForStatus(status: number): ApiErrorBody['code'] {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'VALIDATION';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    default:
      return 'INTERNAL';
  }
}

/** Converteix qualsevol excepció al cos `ApiErrorBody` del contracte. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    let body: ApiErrorBody;

    if (exception instanceof ApiError) {
      body = exception.toBody();
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      let message = exception.message;
      if (typeof raw === 'object' && raw !== null && 'message' in raw) {
        const m = (raw as { message: unknown }).message;
        message = Array.isArray(m) ? m.join('; ') : String(m);
      }
      body = { statusCode: status, code: codeForStatus(status), message };
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      body = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL',
        message: 'Error intern del servidor',
      };
    }

    res.status(body.statusCode).json(body);
  }
}
