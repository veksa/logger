export const zeroPad = (x: number, len = 2): string => {
    return String(x).padStart(len, '0');
}
