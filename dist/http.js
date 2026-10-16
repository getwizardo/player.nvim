/**
 * The HTTP client of the helper.
 *
 * Every request has a timeout, a descriptive user agent and a small retry
 * loop, so that a hiccup of a lyric service does not break the plugin.
 */
/** The user agent that is sent with every request. */
export const USER_AGENT = "player.nvim/0.2 (https://github.com/getwizardo/player.nvim)";
/** The error that is thrown when a request fails. */
export class HttpError extends Error {
    /** The HTTP status code, 0 when the request never reached the server. */
    status;
    /** The URL that was requested. */
    url;
    constructor(message, status, url) {
        super(message);
        this.name = "HttpError";
        this.status = status;
        this.url = url;
    }
}
/** Wait for the given number of milliseconds. */
function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
/** True when the status is worth retrying. */
function isRetryable(status) {
    return status === 408 || status === 429 || status >= 500;
}
/** Fetch a URL and return the response, retrying the transient failures. */
export async function request(url, options = {}) {
    const timeout = options.timeout ?? 20_000;
    const retries = options.retries ?? 2;
    let lastError = undefined;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const response = await fetch(url, {
                headers: {
                    "user-agent": USER_AGENT,
                    accept: options.accept ?? "application/json",
                },
                signal: AbortSignal.timeout(timeout),
            });
            if (response.ok) {
                return response;
            }
            const status = response.status;
            const host = safeHost(url);
            const statusText = response.statusText ? ` ${response.statusText}` : "";
            const error = new HttpError(`HTTP ${status}${statusText} from ${host}.`, status, url);
            if (!isRetryable(status) || attempt === retries) {
                throw error;
            }
            lastError = error;
        }
        catch (error) {
            if (error instanceof HttpError) {
                lastError = error;
                if (attempt === retries) {
                    throw error;
                }
            }
            else {
                lastError = error;
                if (attempt === retries) {
                    throw new HttpError(describe(error), 0, url);
                }
            }
        }
        await delay(250 * (attempt + 1));
    }
    throw lastError instanceof Error ? lastError : new HttpError("The request failed.", 0, url);
}
/** Fetch a URL and decode the JSON answer. */
export async function getJson(url, options = {}) {
    const response = await request(url, options);
    const text = await response.text();
    if (!text.trim()) {
        return undefined;
    }
    try {
        return JSON.parse(text);
    }
    catch {
        throw new HttpError(`The answer of ${safeHost(url)} is not valid JSON.`, response.status, url);
    }
}
/** The host of a URL, or the URL itself when it cannot be parsed. */
function safeHost(url) {
    try {
        return new URL(url).host;
    }
    catch {
        return url;
    }
}
/** A readable description of an unknown error. */
function describe(error) {
    if (error instanceof Error) {
        if (error.name === "TimeoutError" || error.name === "AbortError") {
            return "The request timed out.";
        }
        return error.message;
    }
    return String(error);
}
