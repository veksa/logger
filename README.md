# @veksa/logger

[![npm version](https://img.shields.io/npm/v/@veksa/logger.svg?style=flat-square)](https://www.npmjs.com/package/@veksa/logger)
[![npm downloads](https://img.shields.io/npm/dm/@veksa/logger.svg?style=flat-square)](https://www.npmjs.com/package/@veksa/logger)
[![license](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE.md)

Lightweight, configurable logging library for JavaScript applications

## Installation

@veksa/logger requires **TypeScript 5.8 or later**.

### Using npm or yarn

```bash
# npm
npm install @veksa/logger

# yarn
yarn add @veksa/logger
```

## Features

- Enhanced console logging with millisecond timestamps
- Memory storage of logs with automatic expiration (10 minutes by default) and an optional size limit
- Special formatting for requests, responses, and events
- Easy enabling/disabling of logging
- Support for restricting specific message IDs
- Redaction of sensitive fields (passwords, tokens) in stored logs and console output
- Colorized console output
- Generic type support for type-safe message handling
- Utility functions for log management
- Safe serialization: binary data becomes a size placeholder, errors keep their message and stack,
  circular references never crash the caller

## Basic Usage

```typescript
import { createLogger } from '@veksa/logger';

// Create logger (enabled by default)
const logger = createLogger(true);

// Basic logging
logger.info('Application started');
logger.warn('Resource is running low');
logger.error('Failed to connect', { code: 500 });

// Network message logging
logger.request({
  id: 'GET_USER',
  payload: { userId: 123 },
  clientMsgId: 'abc-123'
}, {
  prefix: 'API',
  messageName: 'GetUser'
});

logger.response({
  id: 'GET_USER',
  payload: { user: { id: 123, name: 'John' } },
  clientMsgId: 'abc-123'
}, {
  prefix: 'API',
  messageName: 'GetUser'
});

// Get all stored logs
const logs = logger.getLogs();

// Disable logging
logger.disable();

// Enable logging
logger.enable();
```

## API Reference

### `createLogger<Message>(isEnabled, options?)`

Creates a new logger instance.

- `isEnabled` (boolean): Whether logging is initially printed to the console. Logs are stored either way.
- `options` (object, optional):
  - `isRestricted(id)`: messages whose id it returns `true` for are neither stored nor printed
  - `redact`: fields to hide, see [Redacting sensitive fields](#redacting-sensitive-fields)
  - `expirationTime` (ms): how long a log is kept; 10 minutes by default, `Infinity` to keep it until `maxItems`
  - `maxItems`: the most logs kept, the oldest go first; no limit by default
  - `captureConsole`: also store what the app passes to `console.log`, `console.warn` and `console.error`;
    `true` by default

The second argument may also be the `isRestricted` function alone, as in earlier versions:
`createLogger(true, id => id === 'PING')`.

Returns an `ILogger<Message>` object with the following methods:

### Methods

- `enable()`: Enable console output
- `disable()`: Disable console output
- `getLogs()`: Get array of stored log items
- `info(text, ...causes)`: Log informational message
- `error(text, ...causes)`: Log error message
- `warn(text, ...causes)`: Log warning message
- `request(item, meta?)`: Log request with optional metadata
- `response(item, meta?)`: Log response with optional metadata
- `event(item, meta?)`: Log event with optional metadata
- `dispose()`: Stop capturing the console and put back the console methods the logger replaced

## Redacting sensitive fields

Values of the listed fields never reach the stored logs (and so `getLogs()`, `mergeLogs()` and any file
you write from them) or the console. The logged object itself is not changed.

```typescript
import { createLogger, DEFAULT_SENSITIVE_KEYS } from '@veksa/logger';

const logger = createLogger(true, {
  redact: {
    keys: ['password', /token$/i],          // these keys at any depth; strings ignore case
    paths: ['payload.card.number'],         // exact dot paths; `*` matches one segment, array items are indices
    censor: '[REDACTED]',                   // the default; or (value, key, path) => replacement
    console: true,                          // redact console output too; the default
  },
});

const login = {
  id: 'LOGIN',
  payload: { user: 'user@example.test', password: 'secret', pin: '1234' },
  clientMsgId: 'abc-123',
};

logger.request(login);
// stored: ... "password":"[REDACTED]","pin":"1234" ...

// extra rules for one message only, added to the logger's rules
logger.request(login, { messageName: 'Login', redact: { paths: ['payload.pin'] } });

// a ready list of common credential field names
createLogger(true, { redact: { keys: [...DEFAULT_SENSITIVE_KEYS] } });
```

Redaction applies to `request`, `response`, `event`, the causes of `info`, `warn` and `error`, and captured
console calls. A redacted object or array is replaced whole. In the console the original objects stay
inspectable: only the objects on the way to a redacted field are copied, everything else is printed as is.

### Interfaces

```typescript
interface ILogItem {
    timestamp: number;
    message: string;
}

interface IMessage<Payload = unknown> {
    id?: string | number;
    payload: Payload;
    clientMsgId: string;
}

interface IMessageMeta {
    prefix?: string;
    prefixColor?: string;
    messageName?: string;
    redact?: IRedactOptions;
}

interface IRedactOptions {
    keys?: (string | RegExp)[];
    paths?: string[];
    censor?: string | ((value: unknown, key: string, path: string) => unknown);
}

interface ILoggerOptions {
    isRestricted?: (id: string | number) => boolean;
    redact?: IRedactOptions & { console?: boolean };
    expirationTime?: number;
    maxItems?: number;
    captureConsole?: boolean;
}

interface ILogger<Message extends IMessage> {
    enable: () => void;
    disable: () => void;
    getLogs: () => ILogItem[];
    info: (text: string, ...causes: unknown[]) => void;
    error: (text: string, ...causes: unknown[]) => void;
    warn: (text: string, ...causes: unknown[]) => void;
    request: (item: Message, meta?: IMessageMeta) => void;
    response: (item: Message, meta?: IMessageMeta) => void;
    event: (item: Message, meta?: IMessageMeta) => void;
    dispose: () => void;
}
```

### Helper Functions

#### `mergeLogs(limit)`

Merges multiple log arrays by timestamp and returns the messages (strings) of the newest `limit` logs, oldest
first.

- `limit` (number): Maximum number of log messages to return

```typescript
import { createLogger, mergeLogs } from '@veksa/logger';

const logger1 = createLogger(true);
const logger2 = createLogger(true);

// Get combined logs from both loggers, limited to 100 entries
const combinedLogs = mergeLogs(100)(logger1.getLogs(), logger2.getLogs());
```

#### `sanitizeObject(obj, options?)`

Returns a JSON-safe copy of a value: binary data (Buffer, typed arrays, ArrayBuffer) becomes a size placeholder,
errors keep their name, message, stack and cause, dates become ISO strings, maps become objects, sets become
arrays, bigints and functions become strings, circular references become `<Circular>`. It never throws.

- `obj` (unknown): The value to sanitize
- `options.redact` (`IRedactOptions`): Keys and paths to replace, as in the logger

```typescript
import { sanitizeObject } from '@veksa/logger';

const data = {
  image: Buffer.from('large binary data'),
  metadata: { size: 1024 }
};

const sanitized = sanitizeObject(data);
// Result: { image: '<Buffer: 17 bytes>', metadata: { size: 1024 } }
```

The logger uses it for every value it stores.

## Contributing

This project welcomes contributions and suggestions.

## License

[MIT](LICENSE.md)
