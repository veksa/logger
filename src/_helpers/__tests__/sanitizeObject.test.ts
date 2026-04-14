import {sanitizeObject} from '../sanitizeObject';

describe('sanitizeObject', () => {
    it('should replace Buffer with string representation', () => {
        const buffer = Buffer.from('test data');
        const result = sanitizeObject(buffer);
        expect(result).toBe('<Buffer: 9 bytes>');
    });

    it('should replace Uint8Array with string representation', () => {
        const uint8Array = new Uint8Array([1, 2, 3, 4, 5]);
        const result = sanitizeObject(uint8Array);
        expect(result).toBe('<Buffer: 5 bytes>');
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
        const buffer = Buffer.from('test');
        const input = [1, 2, buffer, 'string'];
        const result = sanitizeObject(input);
        expect(result).toEqual([1, 2, '<Buffer: 4 bytes>', 'string']);
    });

    it('should sanitize nested objects recursively', () => {
        const buffer = Buffer.from('nested data');
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
        const buffer1 = Buffer.from('first');
        const buffer2 = Buffer.from('second');
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
        const buffer1 = Buffer.from('a');
        const buffer2 = Buffer.from('b');
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
