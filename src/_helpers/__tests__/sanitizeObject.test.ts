import {sanitizeObject} from '../sanitizeObject';

describe('sanitizeObject', () => {
    it('should replace Uint8Array with string representation', () => {
        const uint8Array = new TextEncoder().encode('test data');
        const result = sanitizeObject(uint8Array);
        expect(result).toBe('<Buffer: 9 bytes>');
    });


    it('should return null as is', () => {
        const result = sanitizeObject(null);
        expect(result).toBe(null);
    });

    it('should return undefined as is', () => {
        const result = sanitizeObject(undefined);
        expect(result).toBe(undefined);
    });

    it('should return primitive types as is', () => {
        expect(sanitizeObject('string')).toBe('string');
        expect(sanitizeObject(42)).toBe(42);
        expect(sanitizeObject(true)).toBe(true);
        expect(sanitizeObject(false)).toBe(false);
    });

    it('should sanitize arrays recursively', () => {
        const buffer = new TextEncoder().encode('test');
        const input = [1, 2, buffer, 'string'];
        const result = sanitizeObject(input);
        expect(result).toEqual([1, 2, '<Buffer: 4 bytes>', 'string']);
    });

    it('should sanitize nested objects recursively', () => {
        const buffer = new TextEncoder().encode('nested data');
        const input = {
            level1: {
                level2: {
                    buffer: buffer,
                    text: 'hello',
                },
            },
        };
        const result = sanitizeObject(input);
        expect(result).toEqual({
            level1: {
                level2: {
                    buffer: '<Buffer: 11 bytes>',
                    text: 'hello',
                },
            },
        });
    });

    it('should handle mixed nested structures', () => {
        const buffer1 = new TextEncoder().encode('first');
        const buffer2 = new TextEncoder().encode('second');
        const input = {
            data: [buffer1, { nested: buffer2 }],
            text: 'test',
            number: 123,
        };
        const result = sanitizeObject(input);
        expect(result).toEqual({
            data: ['<Buffer: 5 bytes>', { nested: '<Buffer: 6 bytes>' }],
            text: 'test',
            number: 123,
        });
    });

    it('should handle empty objects', () => {
        const result = sanitizeObject({});
        expect(result).toEqual({});
    });

    it('should handle empty arrays', () => {
        const result = sanitizeObject([]);
        expect(result).toEqual([]);
    });

    it('should handle objects with multiple buffers', () => {
        const buffer1 = new TextEncoder().encode('a');
        const buffer2 = new TextEncoder().encode('b');
        const input = {
            buffer1: buffer1,
            buffer2: buffer2,
            normal: 'text',
        };
        const result = sanitizeObject(input);
        expect(result).toEqual({
            buffer1: '<Buffer: 1 bytes>',
            buffer2: '<Buffer: 1 bytes>',
            normal: 'text',
        });
    });
});
