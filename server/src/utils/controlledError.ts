/**
 * This is the class used for internal error handling.
 */
export default class ControlledError {
	public httpCode: number;

	public reason: string;

	/**
	 * Create a new controlled error.
	 *
	 * @param httpCode - The HTTP code that should be returned by the API.
	 * @param reason - The reason for this error.
	 */
	public constructor(httpCode: number, reason: string) {
		this.httpCode = httpCode;
		this.reason = reason;
	}
}