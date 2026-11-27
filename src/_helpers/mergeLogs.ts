import {ILogItem} from '../logger';

/** Merges log arrays by timestamp and returns the messages of the newest `limit` logs, oldest first. */
export const mergeLogs = (limit: number) => {
    return (...logs: ILogItem[][]): string[] => {
        const result = logs.flat().sort((log, other) => log.timestamp - other.timestamp);

        return result.slice(Math.max(result.length - limit, 0)).map(log => log.message);
    };
};
