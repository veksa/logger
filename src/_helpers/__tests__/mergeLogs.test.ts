import {mergeLogs} from '../mergeLogs';

describe('mergeLogs', () => {
    const first = [{timestamp: 1, message: 'a1'}, {timestamp: 3, message: 'a3'}];
    const second = [{timestamp: 2, message: 'b2'}, {timestamp: 4, message: 'b4'}];

    it('should merge logs by timestamp', () => {
        expect(mergeLogs(10)(first, second)).toEqual(['a1', 'b2', 'a3', 'b4']);
    });

    it('should keep the newest logs up to the limit', () => {
        expect(mergeLogs(2)(first, second)).toEqual(['a3', 'b4']);
    });

    it('should not change the inputs', () => {
        mergeLogs(1)(second, first);
        expect(first.map(log => log.message)).toEqual(['a1', 'a3']);
    });

    it('should return nothing for no logs', () => {
        expect(mergeLogs(5)()).toEqual([]);
    });
});
