import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { err } from './dto/dify-response';

@Catch()
export class DifyExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DifyExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Only handle requests under /agents/dify/*
    if (!request?.url?.startsWith('/agents/dify')) {
      throw exception;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'internal_error';
    let message = 'Internal server error';
    let retryable = true;

    if (exception instanceof BadRequestException) {
      status = HttpStatus.BAD_REQUEST;
      code = 'bad_request';
      message = exception.message;
      retryable = false;
    } else if (exception instanceof UnauthorizedException) {
      status = HttpStatus.UNAUTHORIZED;
      code = 'unauthorized';
      message = exception.message;
      retryable = false;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = status >= 500 ? 'upstream_error' : 'bad_request';
      message = exception.message;
      retryable = status >= 500;
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled error on ${request.url}: ${exception.message}`, exception.stack);
    }

    response.status(status).json(err(code, message, retryable));
  }
}
