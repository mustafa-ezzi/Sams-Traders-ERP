export class HttpError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const buildErrorResponse = (error) => ({
  statusCode: error.statusCode || 500,
  body: {
    error: true,
    message: error.message || "Something went wrong",
    details: error.details || {},
  },
});
