import {createLogger, IMessage} from '../logger';

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error';

const methods: ConsoleMethod[] = ['log', 'info', 'warn', 'error'];

let saved: Record<ConsoleMethod, (...args: unknown[]) => void>;
let mocks: Record<ConsoleMethod, jest.Mock>;

beforeEach(() => {
    saved = {log: console.log, info: console.info, warn: console.warn, error: console.error};
    mocks = {log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn()};
    methods.forEach(method => {
        console[method] = mocks[method];
    });
});

afterEach(() => {
    methods.forEach(method => {
        console[method] = saved[method];
    });
    jest.useRealTimers();
});

const messages = (logger: {getLogs: () => {message: string}[]}) => {
    return logger.getLogs().map(log => log.message.replace(/^\[[^\]]+\]/, '[t]'));
};

const login: IMessage<{user: string}> = {id: 'LOGIN', payload: {user: 'user@example.test'}, clientMsgId: 'c-1'};

describe('createLogger', () => {
    it('should store info, warn and error without a cause suffix when there is no cause', () => {
        const logger = createLogger(true);

        logger.info('started');
        logger.warn('slow');
        logger.error('failed');

        expect(messages(logger)).toEqual(['[t] started', '[t] slow', '[t] failed']);
    });

    it('should store every cause, strings as they are and objects as JSON', () => {
        const logger = createLogger(true);

        logger.info('state', {a: 1}, 'note', 0);

        expect(messages(logger)).toEqual(['[t] state, cause: {"a":1} note 0']);
        expect(mocks.info).toHaveBeenCalledWith('state', {a: 1}, 'note', 0);
    });

    it('should store an error cause with its message', () => {
        const logger = createLogger(true);

        logger.error('request failed', new Error('timeout'));

        expect(logger.getLogs()[0].message).toContain('"message":"timeout"');
    });

    it('should not print when disabled but still store', () => {
        const logger = createLogger(false);

        logger.info('quiet');
        logger.request(login);

        expect(mocks.info).not.toHaveBeenCalled();
        expect(mocks.log).not.toHaveBeenCalled();
        expect(logger.getLogs()).toHaveLength(2);

        logger.enable();
        logger.info('loud');
        expect(mocks.info).toHaveBeenCalledWith('loud');

        logger.disable();
        logger.info('quiet again');
        expect(mocks.info).toHaveBeenCalledTimes(1);
    });

    it('should capture console.log, warn and error calls without a trailing cause', () => {
        const logger = createLogger(true);

        console.log('plain');
        console.warn('with', {a: 1});
        console.error({code: 1});

        expect(messages(logger)).toEqual([
            '[t] LOG: plain',
            '[t] WARN: with, cause: {"a":1}',
            '[t] ERROR: {"code":1}',
        ]);
        expect(mocks.log).toHaveBeenCalledWith('plain');
    });

    it('should format request, response and event without a prefix', () => {
        const logger = createLogger<IMessage>(true);

        logger.request(login);
        logger.response(login, {messageName: 'Login'});
        logger.event({payload: 1, clientMsgId: 'c-2'});

        expect(messages(logger)).toEqual([
            '[t]: Req (LOGIN): {"id":"LOGIN","payload":{"user":"user@example.test"},"clientMsgId":"c-1"}',
            '[t]: Res (Login): {"id":"LOGIN","payload":{"user":"user@example.test"},"clientMsgId":"c-1"}',
            '[t]: Evt (unknown): {"payload":1,"clientMsgId":"c-2"}',
        ]);
    });

    it('should put the prefix before the type', () => {
        const logger = createLogger(true);

        logger.request(login, {prefix: 'API'});

        expect(messages(logger)[0]).toMatch(/^\[t\]: API Req \(LOGIN\): /);
        expect(mocks.log.mock.calls[0][0]).toBe('%c API %c Req [LOGIN]');
    });

    it('should skip restricted ids, including 0', () => {
        const logger = createLogger(true, id => id === 'PING' || id === 0);

        logger.request({id: 'PING', payload: null, clientMsgId: 'c-1'});
        logger.request({id: 0, payload: null, clientMsgId: 'c-2'});
        logger.request(login);

        expect(logger.getLogs()).toHaveLength(1);
        expect(mocks.log).toHaveBeenCalledTimes(1);
    });

    it('should drop logs older than ten minutes', () => {
        jest.useFakeTimers({now: 0});
        const logger = createLogger(true);

        logger.info('old');
        jest.setSystemTime(10 * 60 * 1000 + 1);
        logger.info('new');

        expect(messages(logger)).toEqual(['[t] new']);
    });

    it('should return a copy of the stored logs', () => {
        const logger = createLogger(true);

        logger.info('one');
        logger.getLogs().push({timestamp: 0, message: 'injected'});

        expect(logger.getLogs()).toHaveLength(1);
    });
});

describe('createLogger redaction', () => {
    const auth: IMessage<{user: string; password: string}> = {
        id: 'LOGIN',
        payload: {user: 'user@example.test', password: 'hunter2'},
        clientMsgId: 'c-1',
    };

    it('should keep the isRestricted function working as the second argument', () => {
        const logger = createLogger(true, id => id === 'LOGIN');
        logger.request(auth);
        expect(logger.getLogs()).toHaveLength(0);
    });

    it('should take isRestricted from options', () => {
        const logger = createLogger(true, {isRestricted: id => id === 'LOGIN'});
        logger.request(auth);
        expect(logger.getLogs()).toHaveLength(0);
    });

    it('should never store or print a redacted key', () => {
        const logger = createLogger(true, {redact: {keys: ['password']}});

        logger.request(auth);
        logger.response(auth);
        logger.event(auth);
        logger.error('failed', auth.payload);
        logger.warn('slow', auth);
        logger.info('state', auth);
        console.log('raw', auth);

        const stored = logger.getLogs().map(log => log.message).join('\n');
        expect(stored).not.toContain('hunter2');
        expect(stored).toContain('[REDACTED]');

        const printed = JSON.stringify([mocks.log.mock.calls, mocks.info.mock.calls, mocks.warn.mock.calls, mocks.error.mock.calls]);
        expect(printed).not.toContain('hunter2');

        expect(auth.payload.password).toBe('hunter2');
    });

    it('should print the original object when console redaction is off', () => {
        const logger = createLogger(true, {redact: {keys: ['password'], console: false}});

        logger.request(auth);

        expect(logger.getLogs()[0].message).not.toContain('hunter2');
        expect(mocks.log.mock.calls[0][2]).toBe(auth);
    });

    it('should print the very same object when nothing is redacted', () => {
        const logger = createLogger(true, {redact: {keys: ['password']}});
        logger.request(login);
        expect(mocks.log.mock.calls[0][2]).toBe(login);
    });

    it('should add per-message redaction from meta to the logger rules', () => {
        const logger = createLogger(true, {redact: {keys: ['user']}});

        logger.request(auth, {redact: {paths: ['payload.password']}});
        logger.response(auth);

        const [first, second] = logger.getLogs().map(log => log.message);
        expect(first).toContain('"user":"[REDACTED]","password":"[REDACTED]"');
        expect(second).toContain('"password":"hunter2"');
        expect(JSON.stringify(mocks.log.mock.calls[0])).not.toContain('hunter2');
    });

    it('should redact per message without logger rules', () => {
        const logger = createLogger(true);

        logger.request(auth, {redact: {keys: ['password'], censor: '***'}});

        expect(logger.getLogs()[0].message).toContain('"password":"***"');
    });
});

