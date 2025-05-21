import {zeroPad} from './_helpers/zeroPad';

export interface ILogItem {
    timestamp: number;
    message: string;
}

interface IMessage<Payload = unknown> {
    payloadType: number;
    payload: Payload;
    clientMsgId: string;
}

interface IMessageMeta {
    prefix?: string;
    prefixColor?: string;
    messageName?: string;
}

export interface ILogger {
    enable: () => void;
    disable: () => void;
    getLogs: () => ILogItem[];
    info: (text: string, ...causes: unknown[]) => void;
    error: (text: string, ...causes: unknown[]) => void;
    warn: (text: string, ...causes: unknown[]) => void;
    request: (item: IMessage, meta?: IMessageMeta) => void;
    response: (item: IMessage, meta?: IMessageMeta) => void;
    event: (item: IMessage, meta?: IMessageMeta) => void;
}

const defaultExpirationTime = 10 * 60 * 1000; // 10 minutes

const messageFontColor = 'rgb(50, 57, 65)';

export const createLogger = (isEnabled: boolean, restrictedPayloads: number[] = []): ILogger => {
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

    console.log = (text: string, ...causes: unknown[]) => {
        const {timestamp, format} = getDate();

        const msg = `[${format}] LOG: ${text}`;
        const formatParams = causes
            ? `, cause: ${causes.join(' ')}`
            : '';

        pushLog({timestamp, message: msg + formatParams});

        originalConsoleLog.call(console, text, ...causes);
    };

    console.error = (text: string, ...causes: unknown[]) => {
        const {timestamp, format} = getDate();

        const msg = `[${format}] ERROR: ${text}`;
        const formatParams = causes
            ? `, cause: ${causes.join(' ')}`
            : '';

        pushLog({timestamp, message: msg + formatParams});

        originalConsoleError.call(console, text, ...causes);
    };

    console.warn = (text: string, ...causes: unknown[]) => {
        const {timestamp, format} = getDate();

        const msg = `[${format}] WARN: ${text}`;
        const formatParams = causes
            ? `, cause: ${causes.join(' ')}`
            : '';

        pushLog({timestamp, message: msg + formatParams});

        originalConsoleWarn.call(console, text, ...causes);
    };

    const enable = () => {
        enabled = true;
    };

    const disable = () => {
        enabled = false;
    };

    const getLogs = () => {
        return logs;
    };

    const getDate = () => {
        const date = new Date();

        return {
            timestamp: date.getTime(),
            format: `${zeroPad(date.getDate())}.${zeroPad(date.getMonth() + 1)}.${date.getFullYear()} ${zeroPad(date.getHours())}:${zeroPad(date.getMinutes())}:${zeroPad(date.getSeconds())}`,
        };
    };

    const info = (text: string, cause?: unknown) => {
        const {timestamp, format} = getDate();

        const msg = `[${format}] ${text}`;
        const formatParams = cause
            ? `, cause: ${cause}`
            : '';

        pushLog({timestamp, message: msg + formatParams});

        if (enabled) {
            originalConsoleInfo.call(console,
                ...[text, cause].filter(item => item !== undefined),
            );
        }
    };

    const error = (text: string, cause?: unknown) => {
        const {timestamp, format} = getDate();

        const msg = `[${format}] ${text}`;
        const formatParams = cause
            ? `, cause: ${JSON.stringify(cause)}`
            : '';

        pushLog({timestamp, message: msg + formatParams});

        if (enabled) {
            originalConsoleError.call(console,
                ...[text, cause].filter(item => item !== undefined),
            );
        }
    };

    const warn = (text: string, cause?: unknown) => {
        const {timestamp, format} = getDate();

        const msg = `[${format}] ${text}`;
        const formatParams = cause
            ? `, cause: ${JSON.stringify(cause)}`
            : '';

        pushLog({timestamp, message: msg + formatParams});

        if (enabled) {
            originalConsoleWarn.call(console,
                ...[text, cause].filter(item => item !== undefined),
            );
        }
    };

    const server = (params: { prefix?: string; prefixColor?: string; type: string, name?: string, payloadType: number, color: string, item: IMessage }) => {
        const {prefix, prefixColor = '#d2ac7f', type, name, payloadType, color, item} = params;

        const {timestamp, format} = getDate();

        const msg = `[${format}]: ${type} (${name ?? payloadType}): ${JSON.stringify(item)}`;

        pushLog({timestamp, message: msg});

        if (enabled) {
            originalConsoleLog.call(console,
                `%c ${prefix}: %c ${type} [${name ?? payloadType}]`,
                `background: ${prefixColor}`,
                `background: ${color}; color: ${messageFontColor}`,
                item,
            );
        }
    };

    const request = (item: IMessage, meta: IMessageMeta = {}) => {
        const {prefix, prefixColor, messageName} = meta;

        if (!restrictedPayloads.includes(item.payloadType)) {
            server({
                prefix,
                prefixColor,
                type: 'Req',
                name: messageName,
                payloadType: item.payloadType,
                color: '#daf9d0',
                item
            });
        }
    };

    const response = (item: IMessage, meta: IMessageMeta = {}) => {
        const {prefix, prefixColor, messageName} = meta;

        if (!restrictedPayloads.includes(item.payloadType)) {
            server({
                prefix,
                prefixColor,
                type: 'Res',
                name: messageName,
                payloadType: item.payloadType,
                color: '#cceaf4',
                item
            });
        }
    };

    const event = (item: IMessage, meta: IMessageMeta = {}) => {
        const {prefix, prefixColor, messageName} = meta;

        if (!restrictedPayloads.includes(item.payloadType)) {
            server({
                prefix,
                prefixColor,
                type: 'Evt',
                name: messageName,
                payloadType: item.payloadType,
                color: '#d5d3f3',
                item
            });
        }
    };

    return {
        enable,
        disable,
        getLogs,
        info,
        error,
        warn,
        request,
        response,
        event,
    };
};
