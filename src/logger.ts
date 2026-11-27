import {zeroPad} from './_helpers/zeroPad';
import {createSanitizer, IRedactOptions, mergeRedact, stringify} from './_helpers/sanitizeObject';

export interface ILogItem {
    timestamp: number;
    message: string;
}

export interface IMessage<Payload = unknown> {
    id?: string | number;
    payload: Payload;
    clientMsgId: string;
}

export interface IMessageMeta {
    prefix?: string;
    prefixColor?: string;
    messageName?: string;
    /** Extra redaction for this one message, added to the logger's `redact`. */
    redact?: IRedactOptions;
}

export interface ILoggerRedactOptions extends IRedactOptions {
    /** Redact the objects printed to the console too, not only the stored logs; `true` by default. */
    console?: boolean;
}

export interface ILoggerOptions {
    /** Messages whose id it returns `true` for are neither stored nor printed. */
    isRestricted?: (id: string | number) => boolean;
    /** Keys and paths replaced before a value is stored or printed. */
    redact?: ILoggerRedactOptions;
    /** How long a log is kept, in ms; 10 minutes by default, `Infinity` keeps logs until `maxItems` pushes them out. */
    expirationTime?: number;
    /** The most logs kept; the oldest go first. No limit by default. */
    maxItems?: number;
    /** Store what the app passes to `console.log`, `console.warn` and `console.error`; `true` by default. */
    captureConsole?: boolean;
}

export interface ILogger<Message extends IMessage> {
    enable: () => void;
    disable: () => void;
    getLogs: () => ILogItem[];
    info: (text: string, ...causes: unknown[]) => void;
    error: (text: string, ...causes: unknown[]) => void;
    warn: (text: string, ...causes: unknown[]) => void;
    request: (item: Message, meta?: IMessageMeta) => void;
    response: (item: Message, meta?: IMessageMeta) => void;
    event: (item: Message, meta?: IMessageMeta) => void;
    /** Stops capturing the console and puts back the console methods this logger replaced. */
    dispose: () => void;
}

const defaultExpirationTime = 10 * 60 * 1000; // 10 minutes

const messageFontColor = 'rgb(50, 57, 65)';

type Sanitize = (value: unknown) => unknown;

const formatValue = (value: unknown, sanitize: Sanitize): string => {
    return typeof value === 'string' ? value : stringify(value, sanitize);
};

const formatCauses = (causes: unknown[], sanitize: Sanitize): string => {
    return causes.length > 0
        ? `, cause: ${causes.map(cause => formatValue(cause, sanitize)).join(' ')}`
        : '';
};

/**
 * Creates a logger. The second argument is either the options or, as in earlier versions,
 * the `isRestricted` function alone.
 */
export const createLogger = <Message extends IMessage>(
    isEnabled: boolean, options?: ILoggerOptions | ((id: string | number) => boolean),
): ILogger<Message> => {
    const {
        isRestricted,
        redact,
        expirationTime = defaultExpirationTime,
        maxItems = Infinity,
        captureConsole = true,
    }: ILoggerOptions = typeof options === 'function'
        ? {isRestricted: options}
        : options ?? {};

    const {console: redactConsole = true, ...redactRules} = redact ?? {};

    const serialize = createSanitizer({redact: redactRules});
    const preserve = createSanitizer({redact: redactRules, preserve: true});

    const forConsole = (value: unknown, sanitizeForConsole: Sanitize = preserve) => {
        return redactConsole ? sanitizeForConsole(value) : value;
    };

    let enabled = isEnabled;

    const originalConsoleInfo = console.info;
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    const logs: ILogItem[] = [];

    // logs are kept in the order they were written, so the expired and the extra ones are at the start
    const prune = () => {
        const oldest = Date.now() - expirationTime;

        let expired = 0;
        while (expired < logs.length && logs[expired].timestamp < oldest) {
            expired++;
        }

        const extra = Math.max(logs.length - expired - maxItems, 0);

        if (expired + extra > 0) {
            logs.splice(0, expired + extra);
        }
    };

    const pushLog = (log: ILogItem) => {
        logs.push(log);

        prune();
    };

    const getDate = () => {
        const date = new Date();

        return {
            timestamp: date.getTime(),
            format: `${zeroPad(date.getDate())}.${zeroPad(date.getMonth() + 1)}.${date.getFullYear()} ${zeroPad(date.getHours())}:${zeroPad(date.getMinutes())}:${zeroPad(date.getSeconds())}.${zeroPad(date.getMilliseconds(), 3)}`,
        };
    };

    let capturing = captureConsole;

    const capture = (level: string, original: (...args: unknown[]) => void) => {
        return (text?: unknown, ...causes: unknown[]) => {
            if (!capturing) {
                original.call(console, text, ...causes);
                return;
            }

            const {timestamp, format} = getDate();

            pushLog({
                timestamp,
                message: `[${format}] ${level}: ${formatValue(text, serialize)}${formatCauses(causes, serialize)}`,
            });

            original.call(console, forConsole(text), ...causes.map(cause => forConsole(cause)));
        };
    };

    const patches = captureConsole
        ? {
            log: capture('LOG', originalConsoleLog),
            error: capture('ERROR', originalConsoleError),
            warn: capture('WARN', originalConsoleWarn),
        }
        : undefined;

    if (patches) {
        console.log = patches.log;
        console.error = patches.error;
        console.warn = patches.warn;
    }

    const dispose = () => {
        capturing = false;

        // a method patched again after us stays; our patch inside it now only passes calls through
        if (patches) {
            if (console.log === patches.log) {
                console.log = originalConsoleLog;
            }
            if (console.error === patches.error) {
                console.error = originalConsoleError;
            }
            if (console.warn === patches.warn) {
                console.warn = originalConsoleWarn;
            }
        }
    };

    const enable = () => {
        enabled = true;
    };

    const disable = () => {
        enabled = false;
    };

    const getLogs = () => {
        prune();

        return logs.slice();
    };

    const write = (original: (...args: unknown[]) => void) => {
        return (text: string, ...args: unknown[]) => {
            const causes = args.filter(cause => cause !== undefined);
            const {timestamp, format} = getDate();

            pushLog({timestamp, message: `[${format}] ${text}${formatCauses(causes, serialize)}`});

            if (enabled) {
                original.call(console, text, ...causes.map(cause => forConsole(cause)));
            }
        };
    };

    const info = write(originalConsoleInfo);
    const error = write(originalConsoleError);
    const warn = write(originalConsoleWarn);

    const server = (type: string, color: string) => {
        return (item: Message, meta: IMessageMeta = {}) => {
            const {prefix, prefixColor = '#d2ac7f', messageName, redact: extraRedact} = meta;

            const hasId = item.id !== undefined && item.id !== null;

            if (hasId && isRestricted?.(item.id as string | number)) {
                return;
            }

            const name = messageName ?? (hasId ? item.id : 'unknown');

            const {timestamp, format} = getDate();

            const label = prefix ? `${prefix} ${type}` : type;

            const rules = extraRedact ? mergeRedact(redactRules, extraRedact) : undefined;

            pushLog({
                timestamp,
                message: `[${format}]: ${label} (${name}): ${stringify(item, rules ? createSanitizer({redact: rules}) : serialize)}`,
            });

            if (enabled) {
                const printed = forConsole(item, rules ? createSanitizer({redact: rules, preserve: true}) : preserve);

                if (prefix) {
                    originalConsoleLog.call(console,
                        `%c ${prefix} %c ${type} [${name}]`,
                        `background: ${prefixColor}`,
                        `background: ${color}; color: ${messageFontColor}`,
                        printed,
                    );
                } else {
                    originalConsoleLog.call(console,
                        `%c ${type} [${name}]`,
                        `background: ${color}; color: ${messageFontColor}`,
                        printed,
                    );
                }
            }
        };
    };

    return {
        enable,
        disable,
        getLogs,
        info,
        error,
        warn,
        request: server('Req', '#daf9d0'),
        response: server('Res', '#cceaf4'),
        event: server('Evt', '#d5d3f3'),
        dispose,
    };
};
