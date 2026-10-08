export type TApiSuccessResponse<T = unknown> = {
  statusCode: number;
  message: string;
  data: T;
};

export type TApiErrorResponse = {
  statusCode: number;
  message: string | string[];
  error: string;
};

export type TApiResponse<T = unknown> =
  TApiSuccessResponse<T> | TApiErrorResponse;
