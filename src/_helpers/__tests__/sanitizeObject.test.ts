import {DEFAULT_SENSITIVE_KEYS, sanitizeObject, stringify} from '../sanitizeObject';

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

describe('sanitizeObject redaction', () => {
    const credentials = {
        id: 'LOGIN',
        payload: {user: 'user@example.test', Password: 'hunter2', nested: [{token: 't-1', keep: 1}]},
    };

    it('should redact keys at any depth, ignoring case', () => {
        expect(sanitizeObject(credentials, {redact: {keys: ['password', 'token']}})).toEqual({
            id: 'LOGIN',
            payload: {user: 'user@example.test', Password: '[REDACTED]', nested: [{token: '[REDACTED]', keep: 1}]},
        });
    });

    it('should redact keys matching a RegExp, also a global one', () => {
        const pattern = /pass/gi;
        const result = sanitizeObject({password: 'a', passcode: 'b', other: 'c'}, {redact: {keys: [pattern]}});
        expect(result).toEqual({password: '[REDACTED]', passcode: '[REDACTED]', other: 'c'});
    });

    it('should redact exact paths only', () => {
        const input = {payload: {secret: 's', inner: {secret: 'kept'}}, secret: 'kept'};
        expect(sanitizeObject(input, {redact: {paths: ['payload.secret']}})).toEqual({
            payload: {secret: '[REDACTED]', inner: {secret: 'kept'}},
            secret: 'kept',
        });
    });

    it('should match array indices and wildcards in paths', () => {
        const input = {items: [{code: 1}, {code: 2}]};
        expect(sanitizeObject(input, {redact: {paths: ['items.*.code']}})).toEqual({
            items: [{code: '[REDACTED]'}, {code: '[REDACTED]'}],
        });
        expect(sanitizeObject(input, {redact: {paths: ['items.1']}})).toEqual({
            items: [{code: 1}, '[REDACTED]'],
        });
    });

    it('should redact a whole object or binary value, not walk into it', () => {
        expect(sanitizeObject({auth: {a: 1}, key: new Uint8Array(4)}, {redact: {keys: ['auth', 'key']}})).toEqual({
            auth: '[REDACTED]',
            key: '[REDACTED]',
        });
    });

    it('should use a custom censor and fall back when it throws', () => {
        const censor = (value: unknown, key: string, path: string) => `${key}@${path}:${String(value).length}`;
        expect(sanitizeObject({a: {pin: '1234'}}, {redact: {keys: ['pin'], censor}})).toEqual({a: {pin: 'pin@a.pin:4'}});
        expect(sanitizeObject({pin: 1}, {redact: {keys: ['pin'], censor: () => {
            throw new Error('bad');
        }}})).toEqual({pin: '[REDACTED]'});
        expect(sanitizeObject({pin: 1}, {redact: {keys: ['pin'], censor: '***'}})).toEqual({pin: '***'});
    });

    it('should redact in maps, error fields and error causes', () => {
        const error = Object.assign(new Error('failed'), {password: 'p'});
        Object.defineProperty(error, 'cause', {value: {token: 't'}, enumerable: false});
        const result = sanitizeObject({map: new Map([['password', 'p']]), error}, {redact: {keys: ['password', 'token']}});
        expect(result).toMatchObject({
            map: {password: '[REDACTED]'},
            error: {message: 'failed', password: '[REDACTED]', cause: {token: '[REDACTED]'}},
        });
    });

    it('should not touch the input', () => {
        const input = {password: 'p'};
        sanitizeObject(input, {redact: {keys: ['password']}});
        expect(input).toEqual({password: 'p'});
    });

    it('should cover common credential names with DEFAULT_SENSITIVE_KEYS', () => {
        const result = sanitizeObject({password: 1, accessToken: 2, apiKey: 3, name: 4}, {
            redact: {keys: [...DEFAULT_SENSITIVE_KEYS]},
        });
        expect(result).toEqual({password: '[REDACTED]', accessToken: '[REDACTED]', apiKey: '[REDACTED]', name: 4});
    });
});

describe('sanitizeObject preserve', () => {
    const redact = {keys: ['password']};

    it('should return the same reference when nothing is redacted', () => {
        const input = {user: 'u', data: new Uint8Array(2), at: new Date(0)};
        expect(sanitizeObject(input, {redact, preserve: true})).toBe(input);
        expect(sanitizeObject(input, {preserve: true})).toBe(input);
    });

    it('should copy only the branch with a redacted value and keep the rest by reference', () => {
        const data = new Uint8Array(2);
        const untouched = {a: 1};
        const input = {payload: {password: 'p', data}, untouched, list: [{password: 'q'}, untouched]};

        const result = sanitizeObject(input, {redact, preserve: true}) as typeof input;

        expect(result).not.toBe(input);
        expect(result.payload).toEqual({password: '[REDACTED]', data});
        expect(result.payload.data).toBe(data);
        expect(result.untouched).toBe(untouched);
        expect(result.list[0]).toEqual({password: '[REDACTED]'});
        expect(result.list[1]).toBe(untouched);
        expect(input.payload.password).toBe('p');
    });

    it('should keep the prototype and non-enumerable fields of a copied error', () => {
        const error = Object.assign(new TypeError('failed'), {password: 'p'});
        const result = sanitizeObject(error, {redact, preserve: true}) as TypeError & {password: string};

        expect(result).toBeInstanceOf(TypeError);
        expect(result.message).toBe('failed');
        expect(result.stack).toBe(error.stack);
        expect(result.password).toBe('[REDACTED]');
        expect(error.password).toBe('p');
    });

    it('should redact in maps and sets', () => {
        const result = sanitizeObject({
            map: new Map([['password', 'p'], ['user', 'u']]),
            set: new Set([{password: 'p'}]),
        }, {redact, preserve: true}) as {map: Map<string, string>; set: Set<unknown>};

        expect(result.map.get('password')).toBe('[REDACTED]');
        expect(result.map.get('user')).toBe('u');
        expect(Array.from(result.set)).toEqual([{password: '[REDACTED]'}]);
    });

    it('should survive circular references', () => {
        const input: Record<string, unknown> = {password: 'p'};
        input.self = input;
        const result = sanitizeObject(input, {redact, preserve: true}) as Record<string, unknown>;
        expect(result.password).toBe('[REDACTED]');
        expect(result.self).toBe(input);
    });
});


describe('sanitizeObject never throws', () => {
    it('should turn a nesting deeper than the stack into a placeholder', () => {
        const root: Record<string, unknown> = {};
        let node = root;
        for (let i = 0; i < 100_000; i++) {
            const next: Record<string, unknown> = {};
            node.next = next;
            node = next;
        }

        expect(sanitizeObject(root)).toBe('<Unserializable>');
        expect(sanitizeObject(root, {redact: {keys: ['password']}, preserve: true})).toBe('<Unserializable>');
    });
});
