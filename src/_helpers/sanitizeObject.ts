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

/**
 * Turns any value into a JSON-safe copy for the log buffer: binary data becomes a size placeholder,
 * errors keep their name, message, stack and cause, dates become ISO strings, maps and sets become
 * objects and arrays, bigints and functions become strings, circular references become `<Circular>`.
 * It never throws.
 */
export const sanitizeObject = (value: unknown): unknown => {
    const ancestors = new Set<object>();

    const walk = (current: unknown): unknown => {
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
                return target.map(item => walk(item));
            }

            if (target instanceof Map) {
                const result: Record<string, unknown> = {};
                target.forEach((item, key) => {
                    result[String(key)] = walk(item);
                });
                return result;
            }

            if (target instanceof Set) {
                return Array.from(target, item => walk(item));
            }

            const toJSON = readProperty(target, 'toJSON');
            if (typeof toJSON === 'function') {
                try {
                    return walk(toJSON.call(target));
                } catch {
                    return '<Unserializable>';
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
                    result.cause = walk(target.cause);
                }
            }

            for (const key of Object.keys(target)) {
                result[key] = walk(readProperty(target, key));
            }

            return result;
        } finally {
            ancestors.delete(target);
        }
    };

    return walk(value);
};

/** JSON.stringify of the sanitized value; never throws. */
export const stringify = (value: unknown): string => {
    try {
        return JSON.stringify(sanitizeObject(value)) ?? String(value);
    } catch {
        return '<Unserializable>';
    }
};
