/**
 * The DTO generator for a successful respone.
 *
 * @param data - The response generated by the request.
 * @returns - The DTO.
 */
export const successfulResponse = (data: unknown) => ({
	successful: true,
	data
});

/**
 * The DTO generator for an unsuccessful respone.
 *
 * @param error - The error that meant this request was unsuccessful.
 * @returns The DTO.
 */
export const unsuccessfulResponse = (error: string) => ({
	successful: false,
	error
});