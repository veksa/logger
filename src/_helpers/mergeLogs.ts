import {ILogItem} from '../logger';

export const mergeLogs = (limit: number) => {
    return (...logs: ILogItem[][]) => {
        const resultLogs: ILogItem[][] = [];

        for (let i = 0; i < logs.length; i++) {
            resultLogs.push(logs[i]);
        }

        const result = [...resultLogs].flat().sort((log, other) => log.timestamp - other.timestamp);

        return result.map(log => log.message).slice(Math.max(result.length - limit, 0));
    };
};
