export const sanitizeObject = (obj: unknown): unknown => {
    if ((typeof Buffer !== 'undefined' && Buffer.isBuffer(obj)) || obj instanceof Uint8Array) {
        return `<Buffer: ${(obj as Buffer | Uint8Array).length} bytes>`;
    }

    if (obj === null || obj === undefined) {
        return obj;
    }

    if (typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
    }

    const result: Record<string, unknown> = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            result[key] = sanitizeObject((obj as Record<string, unknown>)[key]);
        }
    }
    return result;
};
