# @infinihash/kyt

Official Node/TypeScript SDK for the [Infinihash KYT API](https://kyt.infinihash.com/docs).

Thin, dependency-free wrapper around the Infinihash KYT REST API (wallet
screening, case management, SAR drafts).

> **Status: Alpha** — API is stable; SDK wrapper surface may still evolve.

## Installation

```bash
npm install @infinihash/kyt
# or
yarn add @infinihash/kyt
```

## Quick Start

```ts
import { Client } from "@infinihash/kyt"; // `KYT` is an identical alias

const client = new Client({ apiKey: process.env.INFINIHASH_KYT_KEY });

const r = await client.screen.address(
  "0x722122dF12D4e14e13Ac3b6895a86e84145b6967",
  "ethereum"
);
console.log(r.risk_score, r.risk_level);

const c = await client.cases.create({
  address: "0x722122dF12D4e14e13Ac3b6895a86e84145b6967",
  notes: "From SDK walkthrough",
});

const fincen = await client.cases.sarExportFinCEN(c.id);
```

## Features

- Wallet and transaction screening
- AI-generated SAR narrative and FinCEN-structured export
- Case management with SAR escalation workflow
- Real-time webhook subscriptions
- Bulk screening, Travel Rule checks, and intelligence-graph lookups
- Full TypeScript types

## Errors

Non-2xx responses throw `KYTError(status, message, body)`. The `body` field
preserves the parsed JSON the server returned.

## Documentation

Full API reference at [kyt.infinihash.com/docs](https://kyt.infinihash.com/docs).

## Support

Questions? [support@infinihash.com](mailto:support@infinihash.com)

## License

MIT © Infinihash LLC
