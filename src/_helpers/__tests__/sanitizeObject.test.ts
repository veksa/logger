import {sanitizeObject, stringify} from '../sanitizeObject';

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

    it('should replace a Node Buffer with its size', () => {
        expect(sanitizeObject(Buffer.from('abc'))).toBe('<Buffer: 3 bytes>');
    });

    it('should keep name, message, stack and cause of an error', () => {
        const cause = new Error('root');
        const error = Object.assign(new TypeError('failed'), {code: 42});
        // like `new Error(message, {cause})`: own, non-enumerable
        Object.defineProperty(error, 'cause', {value: cause, enumerable: false});

        const result = sanitizeObject(error) as Record<string, unknown>;

        expect(result.name).toBe('TypeError');
        expect(result.message).toBe('failed');
        expect(typeof result.stack).toBe('string');
        expect(result.code).toBe(42);
        expect((result.cause as Record<string, unknown>).message).toBe('root');
    });

    it('should turn dates into ISO strings', () => {
        expect(sanitizeObject({at: new Date(0)})).toEqual({at: '1970-01-01T00:00:00.000Z'});
        expect(sanitizeObject(new Date(NaN))).toBe('Invalid Date');
    });

    it('should turn maps into objects and sets into arrays', () => {
        const input = {map: new Map<unknown, unknown>([['a', 1], [2, new Uint8Array(2)]]), set: new Set([1, 2])};
        expect(sanitizeObject(input)).toEqual({map: {a: 1, 2: '<Buffer: 2 bytes>'}, set: [1, 2]});
    });

    it('should turn bigints, symbols and functions into strings', () => {
        function handler() {}
        expect(sanitizeObject({n: BigInt(10), s: Symbol('x'), f: handler})).toEqual({
            n: '10n',
            s: 'Symbol(x)',
            f: '<Function handler>',
        });
    });

    it('should use toJSON when an object defines it', () => {
        expect(sanitizeObject({value: {toJSON: () => ({kept: true})}})).toEqual({value: {kept: true}});
    });

    it('should mark circular references instead of overflowing the stack', () => {
        const input: Record<string, unknown> = {name: 'root'};
        input.self = input;
        input.list = [input];
        expect(sanitizeObject(input)).toEqual({name: 'root', self: '<Circular>', list: ['<Circular>']});
    });

    it('should not mark an object shared by two branches as circular', () => {
        const shared = {value: 1};
        expect(sanitizeObject({a: shared, b: shared})).toEqual({a: {value: 1}, b: {value: 1}});
    });

    it('should replace a throwing getter with a placeholder', () => {
        const input = Object.defineProperty({}, 'broken', {
            enumerable: true,
            get: () => {
                throw new Error('nope');
            },
        });
        expect(sanitizeObject(input)).toEqual({broken: '<Unreadable>'});
    });
});

describe('stringify', () => {
    it('should never throw on circular input', () => {
        const input: Record<string, unknown> = {};
        input.self = input;
        expect(stringify(input)).toBe('{"self":"<Circular>"}');
    });

    it('should stringify undefined as a string', () => {
        expect(stringify(undefined)).toBe('undefined');
    });
});
