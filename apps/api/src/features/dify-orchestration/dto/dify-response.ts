export type DifyOk<T> = { ok: true; data: T };
export type DifyErr = {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
};
export type DifyResponse<T> = DifyOk<T> | DifyErr;

export function ok<T>(data: T): DifyOk<T> {
  return { ok: true, data };
}

export function err(code: string, message: string, retryable = false): DifyErr {
  return { ok: false, error: { code, message, retryable } };
}
