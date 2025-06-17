# @veksa/logger

[![npm version](https://img.shields.io/npm/v/@veksa/logger.svg?style=flat-square)](https://www.npmjs.com/package/@veksa/logger)
[![npm downloads](https://img.shields.io/npm/dm/@veksa/logger.svg?style=flat-square)](https://www.npmjs.com/package/@veksa/logger)
[![license](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE.md)

Official JavaScript logger library for applications

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

- Enhanced console logging with timestamps
- Memory storage of logs with automatic expiration
- Special formatting for requests, responses, and events
- Easy enabling/disabling of logging
- Support for restricting specific payload types
- Colorized console output

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
  payloadType: 1,
  payload: { userId: 123 },
  clientMsgId: 'abc-123'
}, {
  prefix: 'API',
  messageName: 'GetUser'
});

logger.response({
  payloadType: 1,
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

### `createLogger(isEnabled, restrictedPayloads?)`

Creates a new logger instance.

- `isEnabled` (boolean): Whether logging is initially enabled
- `restrictedPayloads` (number[]): Optional array of payload types that should not be logged

Returns an `ILogger` object with the following methods:

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

### Interfaces

```typescript
interface ILogItem {
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

interface ILogger {
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
```

## Contributing

This project welcomes contributions and suggestions.

## License

[MIT](LICENSE.md)
