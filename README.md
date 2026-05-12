# @infinihash/kyt

Official Node/TypeScript SDK for the [Infinihash KYT API](https://kyt.infinihash.com/docs).

> **Status: Alpha** — API is stable; SDK wrapper is actively being built. Full docs coming soon.

## Installation

```bash
npm install @infinihash/kyt
# or
yarn add @infinihash/kyt
```

## Quick Start

```typescript
import { InfinihashKYT } from '@infinihash/kyt';

const kyt = new InfinihashKYT({ apiKey: process.env.INFINIHASH_KYT_KEY });

const result = await kyt.screen({
  type: 'wallet',
  value: '0x722122dF12D4e14e13Ac3b6895a86e84145b6967',
  chain: 'ethereum',
});

console.log(result.risk_level);  // 'critical'
console.log(result.action);      // 'block'
```

## Features

- Wallet and transaction screening
- SAR narrative generation
- Case management
- Real-time webhook subscriptions
- Full TypeScript types

## Documentation

Full API reference at [kyt.infinihash.com/docs](https://kyt.infinihash.com/docs).

## Support

Questions? [support@infinihash.com](mailto:support@infinihash.com)

## License

MIT © Infinihash LLC
