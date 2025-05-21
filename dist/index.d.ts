interface ILogItem {
    timestamp: number;
    message: string;
}
interface IMessage<Payload = unknown> {
    payloadType: number;
    payload: Payload;
    clientMsgId: string;
}
interface ILogger {
    enable: () => void;
    disable: () => void;
    getLogs: () => ILogItem[];
    info: (text: string, cause?: unknown) => void;
    error: (text: string, cause?: unknown) => void;
    warn: (text: string, cause?: unknown) => void;
    request: (item: IMessage) => void;
    response: (item: IMessage) => void;
    event: (item: IMessage) => void;
}
declare const createLogger: (isEnabled: boolean) => ILogger;

export { createLogger };
