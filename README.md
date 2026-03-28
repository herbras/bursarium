<div align="center">

# Indonesian Stock Exchange API Wrapper

A data pipeline for the Indonesian Stock Exchange (IDX). Built with Deno and Drizzle ORM to sync official market data into a structured SQLite database. It includes automated retries for network stability and provides modules for company info, indices, and trading data.

[![Deno](https://img.shields.io/badge/deno-compatible-ffcb00?logo=deno&logoColor=000000)](https://deno.com) [![SQLite](https://img.shields.io/badge/sqlite-compatible-0740ae?logo=sqlite&logoColor=ffffff)](https://www.sqlite.org/) [![Drizzle](https://img.shields.io/badge/drizzle-orm-blue.svg)](https://orm.drizzle.team/)

[![Module type: Deno/ESM](https://img.shields.io/badge/module%20type-deno%2Fesm-brightgreen)](https://github.com/NeaByteLab/IDX-API) [![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

## Features

- **Automated Sync** - Scheduled data synchronization with retry logic
- **Official IDX Data** - Direct integration with Indonesian Stock Exchange APIs
- **Structured Storage** - SQLite database with Drizzle ORM for type-safe queries

## Installation

> [!NOTE]
> **Prerequisites:** For **Deno** (install from [deno.com](https://deno.com/)).

> [!TIP]
> **Want to see the data in action?** Check out [IDX-UI](https://github.com/NeaByteLab/IDX-UI) - the interactive dashboard for your market data!

**Clone Repository:**

```bash
# Clone the repository
git clone https://github.com/NeaByteLab/IDX-API.git

# Enter the project directory
cd IDX-API/

# Initialize the database (Drizzle generate & push)
deno task db:sync
```

**Requirements:**

- **[Deno](https://deno.com/)** (v2.5.0 or higher recommended)
- **Git** (for cloning the repository)

## Technology Stack

- **Runtime**: [Deno](https://deno.com/) (Modern, Secure, High-Performance)
- **Database**: [SQLite](https://www.sqlite.org/) via [LibSQL Client](https://github.com/tursodatabase/libsql-client-ts)
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/) (Type-Safe SQL ORM)

## Architecture Overview

```mermaid
flowchart TD
    %% Define Nodes
    A[(Local SQLite DB)]:::db
    B(Drizzle Schema Sync):::process
    C[IDX API Endpoints]:::api
    D(BaseClient Fetcher):::process
    E{Data Valid?}:::decision
    F(Data Processing):::process
    G(Drizzle Upsert):::process
    H[Your Application / CLI]:::app

    %% Define Flow
    B -->|Setup Tables| A
    C -.->|HTTP Res| D
    D -->|Raw JSON| E
    E -->|No: Retry| D
    E -->|Yes: Parse| F
    F -->|Clean Data| G
    G -->|Store| A
    A -->|Query| H

    %% Styling
    classDef db fill:#e0f7fa,stroke:#006064,stroke-width:2px,color:#000000;
    classDef process fill:#f5f5f5,stroke:#9e9e9e,color:#000000;
    classDef api fill:#fff3e0,stroke:#e65100,stroke-dasharray: 5 5,color:#000000;
    classDef decision fill:#e8f5e9,stroke:#2e7d32,color:#000000,shape:rhombus;
    classDef app fill:#ede7f6,stroke:#4527a0,stroke-width:2px,color:#000000;
```

## Quick Start

```typescript
import * as sync from '@app/Backend/Sync/index.ts'
import IDXClient from '@app/index.ts'

// Initialize database (run once)
await sync.dbInitialize()

// Sync company profiles
await sync.syncCompanyProfile()

// Get current market data
const client = new IDXClient()
const indices = await client.market.getIndexList()
const stockSummary = await client.trading.getStockSummary('20240220')
```

For detailed usage examples, see [USAGE.md](USAGE.md).

## Module Overview

**Corporate Modules:**

- `syncCompanyProfile()` - Company metadata and profiles
- `syncCompanyAnnouncement()` - Corporate news and announcements
- `syncFinancialRatio()` - Financial indicators (PER, PBV, ROE, DER)
- `syncFinancialReport()` - Detailed financial reports
- `syncCompanyDividend()` - Dividend payment data
- `syncStockSplit()` - Stock split events
- `syncNewListing()` - IPO and new listings
- `syncCompanyDelisting()` - Delisted companies

**Market Modules:**

- `syncDailyIndex()` - Daily index performance
- `syncIndexList()` - Current index prices
- `syncIndexSummary()` - Daily index snapshots
- `syncForeignTrading()` - Foreign investor flows
- `syncTopGainer()` - Top gaining stocks
- `syncTopLoser()` - Top losing stocks

**Trading Modules:**

- `syncStockSummary()` - Daily OHLC and volume data
- `syncTradeSummary()` - Market aggregate data
- `syncBrokerSummary()` - Broker trading activity
- `syncTradingDaily()` - Real-time price snapshots
- `syncTradingSS()` - Historical trading data

**Participants Modules:**

- `syncBrokerParticipant()` - Exchange member brokers
- `syncDealerParticipant()` - Primary dealers
- `syncProfileParticipant()` - Participant profiles

**General Modules:**

- `syncMarketCalendar()` - Trading holidays and events
- `syncSecurityStock()` - Master security list

## Project Structure

```text
.
├── src/                  # Core modules and backend implementation
│   ├── Backend/          # Task automation, schemas, and sync logic
│   ├── Company/          # Corporate information endpoints
│   ├── Market/           # Market and index endpoints
│   ├── Participants/     # Broker and dealer endpoints
│   ├── Statistics/       # Stock activity endpoints
│   ├── Trading/          # Trading summary endpoints
│   └── Client.ts         # Main API client wrapper
├── tests/                # Deno unit test suites
├── sample/               # Generator for sample documentation
└── data/                 # SQLite database storage
```

## License

This project is licensed under the MIT license. See the [LICENSE](LICENSE) file for more info.
