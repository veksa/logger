import {zeroPad} from './_helpers/zeroPad';
import {stringify} from './_helpers/sanitizeObject';

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
}

const defaultExpirationTime = 10 * 60 * 1000; // 10 minutes

const messageFontColor = 'rgb(50, 57, 65)';

const formatValue = (value: unknown): string => {
    return typeof value === 'string' ? value : stringify(value);
};

const formatCauses = (causes: unknown[]): string => {
    return causes.length > 0
        ? `, cause: ${causes.map(formatValue).join(' ')}`
        : '';
};

export const createLogger = <Message extends IMessage>(
    isEnabled: boolean, isRestricted?: (id: string | number) => boolean,
): ILogger<Message> => {
    let enabled = isEnabled;

    const originalConsoleInfo = console.info;
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    let logs: ILogItem[] = [];

    const pushLog = (log: ILogItem) => {
        logs.push(log);

        logs = logs.filter(item => item.timestamp >= new Date().getTime() - defaultExpirationTime);
    };

    const getDate = () => {
        const date = new Date();

        return {
            timestamp: date.getTime(),
            format: `${zeroPad(date.getDate())}.${zeroPad(date.getMonth() + 1)}.${date.getFullYear()} ${zeroPad(date.getHours())}:${zeroPad(date.getMinutes())}:${zeroPad(date.getSeconds())}`,
        };
    };

    const capture = (level: string, original: (...args: unknown[]) => void) => {
        return (text?: unknown, ...causes: unknown[]) => {
            const {timestamp, format} = getDate();

            pushLog({timestamp, message: `[${format}] ${level}: ${formatValue(text)}${formatCauses(causes)}`});

            original.call(console, text, ...causes);
        };
    };

    console.log = capture('LOG', originalConsoleLog);
    console.error = capture('ERROR', originalConsoleError);
    console.warn = capture('WARN', originalConsoleWarn);

    const enable = () => {
        enabled = true;
    };

    const disable = () => {
        enabled = false;
    };

    const getLogs = () => {
        return logs.slice();
    };

    const write = (original: (...args: unknown[]) => void) => {
        return (text: string, ...args: unknown[]) => {
            const causes = args.filter(cause => cause !== undefined);
            const {timestamp, format} = getDate();

            pushLog({timestamp, message: `[${format}] ${text}${formatCauses(causes)}`});

            if (enabled) {
                original.call(console, text, ...causes);
            }
        };
    };

    const info = write(originalConsoleInfo);
    const error = write(originalConsoleError);
    const warn = write(originalConsoleWarn);

    const server = (type: string, color: string) => {
        return (item: Message, meta: IMessageMeta = {}) => {
            const {prefix, prefixColor = '#d2ac7f', messageName} = meta;

            const hasId = item.id !== undefined && item.id !== null;

            if (hasId && isRestricted?.(item.id as string | number)) {
                return;
            }

            const name = messageName ?? (hasId ? item.id : 'unknown');

            const {timestamp, format} = getDate();

            const label = prefix ? `${prefix} ${type}` : type;

            pushLog({timestamp, message: `[${format}]: ${label} (${name}): ${stringify(item)}`});

            if (enabled) {
                if (prefix) {
                    originalConsoleLog.call(console,
                        `%c ${prefix} %c ${type} [${name}]`,
                        `background: ${prefixColor}`,
                        `background: ${color}; color: ${messageFontColor}`,
                        item,
                    );
                } else {
                    originalConsoleLog.call(console,
                        `%c ${type} [${name}]`,
                        `background: ${color}; color: ${messageFontColor}`,
                        item,
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
    };
};
