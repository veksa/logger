/** A key to redact: a string matches a key of that name in any case, a RegExp is tested against the key. */
export type RedactMatcher = string | RegExp;

/** What a redacted value becomes: a fixed string, or a function of the value, its key and its dot path. */
export type RedactCensor = string | ((value: unknown, key: string, path: string) => unknown);

export interface IRedactOptions {
    /** Keys redacted at any depth, e.g. `['password', /token$/i]`. */
    keys?: RedactMatcher[];
    /** Dot paths from the logged value, e.g. `'payload.password'`; `*` matches any one segment, array items are indices. */
    paths?: string[];
    /** Replacement for a redacted value; `'[REDACTED]'` by default. */
    censor?: RedactCensor;
}

export interface ISanitizeOptions {
    redact?: IRedactOptions;
    /**
     * Keep values as they are — binary data, dates, errors, class instances — and copy only the objects on
     * the way to a redacted value; an object with nothing to redact is returned as is. Used for console
     * output, where the original objects stay inspectable.
     */
    preserve?: boolean;
}

export const DEFAULT_CENSOR = '[REDACTED]';

/** Common names of fields that hold credentials. Opt in with `redact: {keys: DEFAULT_SENSITIVE_KEYS}`. */
export const DEFAULT_SENSITIVE_KEYS: readonly string[] = [
    'password',
    'passwd',
    'pwd',
    'passphrase',
    'secret',
    'clientSecret',
    'token',
    'accessToken',
    'refreshToken',
    'idToken',
    'apiKey',
    'authorization',
    'cookie',
    'pin',
    'otp',
    'cvv',
];

interface IRedactor {
    keys: Set<string>;
    patterns: RegExp[];
    paths: string[][];
    censor: RedactCensor;
}

const compileRedactor = (redact?: IRedactOptions): IRedactor | undefined => {
    if (!redact) {
        return undefined;
    }

    const keys = new Set<string>();
    const patterns: RegExp[] = [];

    (redact.keys ?? []).forEach(key => {
        if (typeof key === 'string') {
            keys.add(key.toLowerCase());
        } else {
            patterns.push(key);
        }
    });

    const paths = (redact.paths ?? []).map(path => path.split('.'));

    if (keys.size === 0 && patterns.length === 0 && paths.length === 0) {
        return undefined;
    }

    return {keys, patterns, paths, censor: redact.censor ?? DEFAULT_CENSOR};
};

const matchesKey = (redactor: IRedactor, key: string): boolean => {
    if (redactor.keys.has(key.toLowerCase())) {
        return true;
    }

    return redactor.patterns.some(pattern => {
        pattern.lastIndex = 0;
        return pattern.test(key);
    });
};

const matchesPath = (redactor: IRedactor, path: string[]): boolean => {
    return redactor.paths.some(pattern => {
        return pattern.length === path.length
            && pattern.every((segment, index) => segment === '*' || segment === path[index]);
    });
};

/** Merges two redaction settings: keys and paths add up, the censor of `extra` wins. */
export const mergeRedact = (base?: IRedactOptions, extra?: IRedactOptions): IRedactOptions | undefined => {
    if (!base || !extra) {
        return base ?? extra;
    }

    return {
        keys: [...(base.keys ?? []), ...(extra.keys ?? [])],
        paths: [...(base.paths ?? []), ...(extra.paths ?? [])],
        censor: extra.censor ?? base.censor,
    };
};

const isBinary = (value: unknown): value is ArrayBufferView | ArrayBuffer => {
    return (typeof Buffer !== 'undefined' && Buffer.isBuffer(value))
        || ArrayBuffer.isView(value)
        || value instanceof ArrayBuffer;
};

const readProperty = (target: object, key: string): unknown => {
    try {
        return (target as Record<string, unknown>)[key];
    } catch {
        return '<Unreadable>';
    }
};

const unchanged = Symbol('unchanged');

const UNSERIALIZABLE = '<Unserializable>';

/** Builds a sanitizer once for repeated use with the same options. */
export const createSanitizer = (options: ISanitizeOptions = {}): (value: unknown) => unknown => {
    const redactor = compileRedactor(options.redact);

    if (options.preserve && !redactor) {
        return value => value;
    }

    const sanitize = options.preserve && redactor ? createPreserver(redactor) : createSerializer(redactor);

    // A value the walk cannot finish (nesting deeper than the stack, a proxy whose traps throw) becomes a
    // placeholder: logging never throws into the caller, and the unredacted original is never let through.
    return value => {
        try {
            return sanitize(value);
        } catch {
            return UNSERIALIZABLE;
        }
    };
};

const censorValue = (redactor: IRedactor, value: unknown, key: string, path: string[]): unknown => {
    const {censor} = redactor;

    if (typeof censor === 'string') {
        return censor;
    }

    try {
        return censor(value, key, path.join('.'));
    } catch {
        return DEFAULT_CENSOR;
    }
};

const shouldRedact = (redactor: IRedactor | undefined, key: string, path: string[]): redactor is IRedactor => {
    return redactor !== undefined && (matchesKey(redactor, key) || matchesPath(redactor, path));
};

const createSerializer = (redactor?: IRedactor) => {
    return (value: unknown): unknown => {
        const ancestors = new Set<object>();

        const child = (item: unknown, key: string, path: string[]): unknown => {
            const childPath = [...path, key];

            return shouldRedact(redactor, key, childPath)
                ? censorValue(redactor, item, key, childPath)
                : walk(item, childPath);
        };

        const walk = (current: unknown, path: string[]): unknown => {
            if (current === null || current === undefined) {
                return current;
            }

            switch (typeof current) {
                case 'string':
                case 'number':
                case 'boolean':
                    return current;
                case 'bigint':
                    return `${current}n`;
                case 'symbol':
                    return current.toString();
                case 'function':
                    return `<Function ${current.name || 'anonymous'}>`;
            }

            if (isBinary(current)) {
                return `<Buffer: ${current.byteLength} bytes>`;
            }

            const target = current as object;

            if (ancestors.has(target)) {
                return '<Circular>';
            }

            if (target instanceof Date) {
                return Number.isNaN(target.getTime()) ? 'Invalid Date' : target.toISOString();
            }

            if (target instanceof RegExp) {
                return String(target);
            }

            ancestors.add(target);

            try {
                if (Array.isArray(target)) {
                    return target.map((item, index) => child(item, String(index), path));
                }

                if (target instanceof Map) {
                    const result: Record<string, unknown> = {};
                    target.forEach((item, key) => {
                        result[String(key)] = child(item, String(key), path);
                    });
                    return result;
                }

                if (target instanceof Set) {
                    return Array.from(target, (item, index) => child(item, String(index), path));
                }

                const toJSON = readProperty(target, 'toJSON');
                if (typeof toJSON === 'function') {
                    try {
                        return walk(toJSON.call(target), path);
                    } catch {
                        return UNSERIALIZABLE;
                    }
                }

                const result: Record<string, unknown> = {};

                if (target instanceof Error) {
                    result.name = target.name;
                    result.message = target.message;
                    if (target.stack) {
                        result.stack = target.stack;
                    }
                    if ('cause' in target && target.cause !== undefined) {
                        result.cause = child(target.cause, 'cause', path);
                    }
                }

                for (const key of Object.keys(target)) {
                    result[key] = child(readProperty(target, key), key, path);
                }

                return result;
            } finally {
                ancestors.delete(target);
            }
        };

        return walk(value, []);
    };
};

const createPreserver = (redactor: IRedactor) => {
    return (value: unknown): unknown => {
        const ancestors = new Set<object>();

        // Returns `unchanged` when nothing under `current` is redacted, so the original reference is kept.
        const walk = (current: unknown, path: string[]): unknown => {
            if (current === null || typeof current !== 'object' || isBinary(current)
                || current instanceof Date || current instanceof RegExp || ancestors.has(current)) {
                return unchanged;
            }

            const visit = (item: unknown, key: string): unknown => {
                const childPath = [...path, key];

                return shouldRedact(redactor, key, childPath)
                    ? censorValue(redactor, item, key, childPath)
                    : walk(item, childPath);
            };

            ancestors.add(current);

            try {
                if (Array.isArray(current)) {
                    let copy: unknown[] | undefined;
                    current.forEach((item, index) => {
                        const next = visit(item, String(index));
                        if (next !== unchanged) {
                            copy = copy ?? current.slice();
                            copy[index] = next;
                        }
                    });
                    return copy ?? unchanged;
                }

                if (current instanceof Map) {
                    let copy: Map<unknown, unknown> | undefined;
                    current.forEach((item, key) => {
                        const next = visit(item, String(key));
                        if (next !== unchanged) {
                            copy = copy ?? new Map(current);
                            copy.set(key, next);
                        }
                    });
                    return copy ?? unchanged;
                }

                if (current instanceof Set) {
                    const items = Array.from(current);
                    let changed = false;
                    const next = items.map((item, index) => {
                        const result = visit(item, String(index));
                        if (result === unchanged) {
                            return item;
                        }
                        changed = true;
                        return result;
                    });
                    return changed ? new Set(next) : unchanged;
                }

                const changes: [string, unknown][] = [];

                const keys = Object.keys(current);
                if (current instanceof Error && 'cause' in current && !keys.includes('cause')) {
                    keys.push('cause');
                }

                for (const key of keys) {
                    const next = visit(readProperty(current, key), key);
                    if (next !== unchanged) {
                        changes.push([key, next]);
                    }
                }

                if (changes.length === 0) {
                    return unchanged;
                }

                const copy = Object.create(Object.getPrototypeOf(current)) as Record<string, unknown>;
                const descriptors = Object.getOwnPropertyDescriptors(current);

                changes.forEach(([key]) => {
                    delete descriptors[key];
                });

                Object.defineProperties(copy, descriptors);

                if (current instanceof Error) {
                    // `stack` may be an accessor bound to the original error; copy the values instead
                    (['name', 'message', 'stack'] as const).forEach(key => {
                        if (!changes.some(([changed]) => changed === key)) {
                            Object.defineProperty(copy, key, {
                                value: readProperty(current, key),
                                enumerable: false,
                                writable: true,
                                configurable: true,
                            });
                        }
                    });
                }

                changes.forEach(([key, next]) => {
                    Object.defineProperty(copy, key, {value: next, enumerable: true, writable: true, configurable: true});
                });

                return copy;
            } finally {
                ancestors.delete(current);
            }
        };

        // the root itself is never redacted, only what it holds
        const result = walk(value, []);

        return result === unchanged ? value : result;
    };
};

/**
 * Turns any value into a JSON-safe copy for the log buffer: binary data becomes a size placeholder,
 * errors keep their name, message, stack and cause, dates become ISO strings, maps and sets become
 * objects and arrays, bigints and functions become strings, circular references become `<Circular>`,
 * and keys or paths listed in `options.redact` are replaced with the censor. It never throws.
 */
export const sanitizeObject = (value: unknown, options?: ISanitizeOptions): unknown => {
    return createSanitizer(options)(value);
};

/** JSON.stringify of a sanitized value; never throws. */
export const stringify = (value: unknown, sanitize: (value: unknown) => unknown = createSanitizer()): string => {
    try {
        return JSON.stringify(sanitize(value)) ?? String(value);
    } catch {
        return UNSERIALIZABLE;
    }
};
