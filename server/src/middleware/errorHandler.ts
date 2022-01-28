import { Response } from "express";
import { ControlledError, unsuccessfulResponse } from "@utils";

/**
 * Handle an error that has been passed through the express middleware.
 *
 * @param err - The error.
 * @param res - The response object used for communicating with the client.
 */
export default (err: ControlledError | Error, {}, res: Response, {}) => {
	const isControlledError = err instanceof ControlledError;

	if(!isControlledError) {
		console.error(err);
	}

	const error = isControlledError ? err : new ControlledError(500, "Internal server error");

	res.status(error.httpCode).send(unsuccessfulResponse(error.reason));
};