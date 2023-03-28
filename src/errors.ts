/* eslint-disable max-classes-per-file */
/**
 * Error will be propagate into scraper output.
 */
export class UserFacedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UserFacedError';
        this.message = message;
    }
}

/**
 * Error from OpenAI API.
 */
export class OpenaiAPIError extends Error {
    constructor(message?: string) {
        const name = 'OpenaiAPIError';
        const tuneMessage = `OpenaiAPIError: ${message || 'Internal Error'}`;
        super(message);
        this.name = name;
        this.message = tuneMessage;
    }
}
