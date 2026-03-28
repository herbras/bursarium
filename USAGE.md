# Usage

Synchronization and API access for Indonesian Stock Exchange (IDX) data pipeline.

## Table of Contents

- [Quick Start](#quick-start)
- [Synchronization Modules](#synchronization-modules)
- [Direct API Access](#direct-api-access)
- [Database Operations](#database-operations)
- [Error Handling](#error-handling)
- [Performance Tips](#performance-tips)
- [API Reference](#api-reference)

## Quick Start

```typescript
import * as sync from '@app/Backend/Sync/index.ts'
import IDXClient from '@app/index.ts'

// Initialize database (run once)
await sync.dbInitialize()

// Sync data
await sync.syncCompanyProfile()
await sync.syncStockSummary('20240220')

// Direct API access
const client = new IDXClient()
const indices = await client.market.getIndexList()
```

## Synchronization Modules

### Corporate Data

```typescript
// Company profiles and metadata
await sync.syncCompanyProfile()
await sync.syncProfileAnnouncement('BBCA')

// Financial data
await sync.syncFinancialRatio(2024, 2)
await sync.syncFinancialReport('BBCA', 2024, 'audit')

// Corporate events
await sync.syncCompanyDividend(2024, 2)
await sync.syncStockSplit(2024, 2)
await sync.syncNewListing(2024, 2)
await sync.syncCompanyDelisting(2024, 2)

// Announcements
await sync.syncCompanyAnnouncement('20240220')
```

### Market Data

```typescript
// Indices performance
await sync.syncDailyIndex(2024, 2)
await sync.syncIndexList()
await sync.syncIndexSummary('20240220')
await sync.syncIndexChart('COMPOSITE')

// Market statistics
await sync.syncTopGainer(2024, 2)
await sync.syncTopLoser(2024, 2)
await sync.syncSectoralMovement(2024, 2)
await sync.syncForeignTrading(2024, 2)
```

### Trading Data

```typescript
// Daily trading summaries
await sync.syncStockSummary('20240220')
await sync.syncTradeSummary()
await sync.syncBrokerSummary('20240220')

// Historical data
await sync.syncTradingDaily('BBCA')
await sync.syncTradingSS('BBCA')

// Trading statistics
await sync.syncDomesticTrading(2024, 2)
await sync.syncIndustryTrading(2024, 2)
await sync.syncActiveVolume(2024, 2)
```

### Participants Data

```typescript
// Broker and dealer information
await sync.syncBrokerParticipant()
await sync.syncDealerParticipant()
await sync.syncProfileParticipant()
```

### General Data

```typescript
// Market calendar and securities
await sync.syncMarketCalendar('20240220')
await sync.syncSecurityStock()
```

## Direct API Access

### Company Module

```typescript
const client = new IDXClient()

// Company profiles
const profiles = await client.company.getCompanyProfiles(0, 100)
const detail = await client.company.getCompanyProfilesDetail('BBCA')

// Announcements
const announcements = await client.company.getAnnouncements('BBCA', 9999, 0, '20240101', '20241231')

// Financial data
const ratios = await client.company.getFinancialRatios(2024, 2)
const reports = await client.company.getFinancialReports('BBCA', 2024, 'audit')

// Corporate events
const dividends = await client.company.getDividendAnnouncements(2024, 2)
const splits = await client.company.getStockSplits(2024, 2)
const listings = await client.company.getNewListings(2024, 2)
```

### Market Module

```typescript
// Indices data
const indices = await client.market.getIndexList()
const dailyData = await client.market.getDailyIndices(2024, 2)
const chartData = await client.market.getIndexChart('COMPOSITE', '1Y')

// Calendar
const calendar = await client.market.getCalendar('20240220')
const sectors = await client.market.getSectoralMovement(2024, 2)
```

### Trading Module

```typescript
// Stock summaries
const summary = await client.trading.getStockSummary('20240220')
const daily = await client.trading.getTradingInfoDaily('BBCA')
const historical = await client.trading.getTradingInfoSS('BBCA', 0, 1000)

// Market statistics
const gainers = await client.trading.getTopGainers(2024, 2)
const losers = await client.trading.getTopLosers(2024, 2)
const activeValue = await client.trading.getMostActiveByValue(2024, 2)

// Broker data
const brokerSummary = await client.trading.getBrokerSummary('20240220', 0, 100)
```

### Participants Module

```typescript
// Search brokers and dealers
const brokers = await client.participants.getBrokerSearch(0, 100)
const dealers = await client.participants.getPrimaryDealerSearch(0, 100)
const participants = await client.participants.getParticipantSearch(0, 100)
```

## Database Operations

### Initialize Database

```typescript
import * as sync from '@app/Backend/Sync/index.ts'

// Create tables and sync schema
await sync.dbInitialize()
```

### Query Data

```typescript
import Database from '@app/Database.ts'

const db = new Database()

// Get all companies
const companies = await db.query.companies.findMany()

// Get specific stock summary
const summary = await db.query.stockSummaries.findFirst({
  where: eq(stockSummaries.date, '20240220')
})
```

### Custom Queries

```typescript
// Complex queries with joins
const results = await db.query.companies.findMany({
  with: {
    stockSummaries: {
      where: eq(stockSummaries.date, '20240220')
    }
  }
})
```

## Error Handling

### Network Errors

```typescript
try {
  await sync.syncCompanyProfile()
} catch (error) {
  if (error.message.includes('network')) {
    // Retry logic handled automatically by BaseClient
    console.log('Network error, retrying...')
  }
}
```

### Data Validation

```typescript
import { validateCompanyData } from '@app/Backend/Validator.ts'

const data = await client.company.getCompanyProfiles()
if (validateCompanyData(data)) {
  // Process valid data
} else {
  // Handle invalid data
}
```

### Database Errors

```typescript
try {
  await db.insert(companies).values(companyData)
} catch (error) {
  if (error.message.includes('UNIQUE constraint')) {
    // Handle duplicate records
  }
}
```

## Performance Tips

### Batch Operations

```typescript
// Sync multiple months efficiently
for (const month of [1, 2, 3, 4, 5, 6]) {
  await sync.syncDailyIndex(2024, month)
}
```

### Parallel Processing

```typescript
// Run multiple sync tasks in parallel
await Promise.all([sync.syncCompanyProfile(), sync.syncSecurityStock(), sync.syncIndexList()])
```

### Memory Management

```typescript
// Process large datasets in chunks
const pageSize = 100
for (let page = 0; page < totalPages; page++) {
  const data = await client.company.getCompanyProfiles(page * pageSize, pageSize)
  // Process chunk
}
```

### Caching

```typescript
// Cache frequently accessed data
const cache = new Map()

async function getCachedData(key, fetchFn) {
  if (!cache.has(key)) {
    cache.set(key, await fetchFn())
  }
  return cache.get(key)
}
```

## API Reference

### company.getAdditionalListings

```typescript
client.company.getAdditionalListings(year, month, pageSize, pageNumber)
```

- `year` `<number>`: Target year
- `month` `<number>`: Target month (1-12)
- `pageSize` `<number>`: (Optional) Record count limit. Defaults to 10.
- `pageNumber` `<number>`: (Optional) Pagination page number. Defaults to 1.
- Returns: `Promise<Types.CompanyPaginatedResponse<Types.AdditionalListing> | null>`
- Description: Returns paginated list of newly added shares listings.

### company.getAnnouncements

```typescript
client.company.getAnnouncements(companyCode, pageSize, indexFrom, dateFrom, dateTo, language)
```

- `companyCode` `<string>`: (Optional) Company ticker filter. Defaults to `''`.
- `pageSize` `<number>`: (Optional) Record count limit. Defaults to 9999.
- `indexFrom` `<number>`: (Optional) Pagination start index. Defaults to 0.
- `dateFrom` `<string>`: (Optional) Start date YYYYMMDD. Defaults to `''`.
- `dateTo` `<string>`: (Optional) End date YYYYMMDD. Defaults to `''`.
- `language` `<string>`: (Optional) Language code (id/en). Defaults to `'id'`.
- Returns: `Promise<Types.AnnouncementResponse | null>`
- Description: Returns filtered IDX announcements data.

### company.getCompanyProfiles

```typescript
client.company.getCompanyProfiles(start, length)
```

- `start` `<number>`: (Optional) Starting record index. Defaults to 0.
- `length` `<number>`: (Optional) Maximum record count. Defaults to 9999.
- Returns: `Promise<Types.CompanyProfileResponse | null>`
- Description: Returns list of basic company profile information.

### company.getCompanyProfilesDetail

```typescript
client.company.getCompanyProfilesDetail(companyCode, language)
```

- `companyCode` `<string>`: Company ticker code (e.g., BBCA).
- `language` `<string>`: (Optional) Language code (id-id). Defaults to `'id-id'`.
- Returns: `Promise<Types.CompanyDetailResponse | null>`
- Description: Returns detailed metadata for a specific company ticker.

### company.getDelistings

```typescript
client.company.getDelistings(year, month, pageSize, pageNumber)
```

- `year` `<number>`: Target year
- `month` `<number>`: Target month (1-12)
- `pageSize` `<number>`: (Optional) Record count limit. Defaults to 10.
- `pageNumber` `<number>`: (Optional) Pagination page number. Defaults to 1.
- Returns: `Promise<Types.CompanyPaginatedResponse<Types.Delisting> | null>`
- Description: Returns paginated list of delisted stocks.

### company.getDividendAnnouncements

```typescript
client.company.getDividendAnnouncements(year, month, pageSize, pageNumber)
```

- `year` `<number>`: Target year
- `month` `<number>`: Target month (1-12)
- `pageSize` `<number>`: (Optional) Record count limit. Defaults to 10.
- `pageNumber` `<number>`: (Optional) Pagination page number. Defaults to 1.
- Returns: `Promise<Types.CompanyPaginatedResponse<Types.DividendAnnouncement> | null>`
- Description: Returns paginated list of dividend events.

### company.getFinancialRatios

```typescript
client.company.getFinancialRatios(year, month)
```

- `year` `<number>`: Target year
- `month` `<number>`: Target month (1-12)
- Returns: `Promise<Types.CompanyPaginatedResponse<Types.FinancialRatio> | null>`
- Description: Returns paginated financial indicators.

### company.getFinancialReports

```typescript
client.company.getFinancialReports(companyCode, year, period, indexFrom, pageSize)
```

- `companyCode` `<string>`: Company ticker code
- `year` `<number>`: Target year
- `period` `<string>`: (Optional) Fiscal period (TW1, TW2, TW3, audit). Defaults to `'audit'`.
- `indexFrom` `<number>`: (Optional) Pagination start index. Defaults to 0.
- `pageSize` `<number>`: (Optional) Record count limit. Defaults to 100.
- Returns: `Promise<Types.FinancialReport[] | null>`
- Description: Returns company financial reporting records.

### company.getIssuedHistory

```typescript
client.company.getIssuedHistory(companyCode, start, length)
```

- `companyCode` `<string>`: Company ticker code
- `start` `<number>`: (Optional) Pagination start index. Defaults to 0.
- `length` `<number>`: (Optional) Maximum record count. Defaults to 9999.
- Returns: `Promise<Types.IssuedHistory[] | null>`
- Description: Record of company share issuance events.

### company.getNewListings

```typescript
client.company.getNewListings(year, month, pageSize, pageNumber)
```

- `year` `<number>`: Target year
- `month` `<number>`: Target month (1-12)
- `pageSize` `<number>`: (Optional) Record count limit. Defaults to 10.
- `pageNumber` `<number>`: (Optional) Pagination page number. Defaults to 1.
- Returns: `Promise<Types.CompanyPaginatedResponse<Types.NewListing> | null>`
- Description: Returns paginated list of newly listed stocks.

### company.getProfileAnnouncements

```typescript
client.company.getProfileAnnouncements(companyCode, indexFrom, pageSize, dateFrom, dateTo, language)
```

- `companyCode` `<string>`: (Optional) Company ticker filter. Defaults to `''`.
- `indexFrom` `<number>`: (Optional) Pagination start index. Defaults to 0.
- `pageSize` `<number>`: (Optional) Record count limit. Defaults to 10.
- `dateFrom` `<string>`: (Optional) Start date YYYYMMDD. Defaults to `''`.
- `dateTo` `<string>`: (Optional) End date YYYYMMDD. Defaults to `''`.
- `language` `<string>`: (Optional) Language code (id/en). Defaults to `'id'`.
- Returns: `Promise<Types.ProfileAnnouncement[] | null>`
- Description: Individual records for company profile updates.

### company.getRelistingData

```typescript
client.company.getRelistingData(pageSize, indexFrom)
```

- `pageSize` `<number>`: (Optional) Record count per page. Defaults to 9999.
- `indexFrom` `<number>`: (Optional) Pagination start index. Defaults to 0.
- Returns: `Promise<Types.RelistingResponse | null>`
- Description: Returns companies that have been relisted.

### company.getRightOfferings

```typescript
client.company.getRightOfferings(year, month, pageSize, pageNumber)
```

- `year` `<number>`: Target year
- `month` `<number>`: Target month (1-12)
- `pageSize` `<number>`: (Optional) Record count limit. Defaults to 10.
- `pageNumber` `<number>`: (Optional) Pagination page number. Defaults to 1.
- Returns: `Promise<Types.CompanyPaginatedResponse<Types.RightOffering> | null>`
- Description: Returns paginated list of subscription right offerings.

### company.getSecuritiesStock

```typescript
client.company.getSecuritiesStock(start, length, code, sector, board)
```

- `start` `<number>`: (Optional) Starting record index. Defaults to 0.
- `length` `<number>`: (Optional) Maximum record count. Defaults to 9999.
- `code` `<string>`: (Optional) Ticker code filter. Defaults to `''`.
- `sector` `<string>`: (Optional) Sector filter. Defaults to `''`.
- `board` `<string>`: (Optional) Board category filter. Defaults to `''`.
- Returns: `Promise<Types.SecuritiesStockResponse | null>`
- Description: Returns list of IDX listed companies.

### company.getStockScreener

```typescript
client.company.getStockScreener(sector, subSector)
```

- `sector` `<string>`: (Optional) Sector filter. Defaults to `''`.
- `subSector` `<string>`: (Optional) Sub-sector filter. Defaults to `''`.
- Returns: `Promise<Types.StockScreenerResponse | null>`
- Description: Returns stock profile metrics data.

### company.getStockSplits

```typescript
client.company.getStockSplits(year, month, pageSize, pageNumber)
```

- `year` `<number>`: Target year
- `month` `<number>`: Target month (1-12)
- `pageSize` `<number>`: (Optional) Record count limit. Defaults to 10.
- `pageNumber` `<number>`: (Optional) Pagination page number. Defaults to 1.
- Returns: `Promise<Types.CompanyPaginatedResponse<Types.StockSplit> | null>`
- Description: Returns paginated list of stock split events.

### company.getSuspendData

```typescript
client.company.getSuspendData(resultCount)
```

- `resultCount` `<number>`: (Optional) Number of recent events. Defaults to 9999.
- Returns: `Promise<Types.SuspendResponse | null>`
- Description: Returns list of recently suspended securities.

### market.getCalendar

```typescript
client.market.getCalendar(date)
```

- `date` `<string>`: Date in YYYYMMDD format
- Returns: `Promise<Types.CalendarResponse | null>`
- Description: Returns agenda and events for specified date.

### market.getDailyIndices

```typescript
client.market.getDailyIndices(year, month)
```

- `year` `<number>`: Target year
- `month` `<number>`: Target month (1-12)
- Returns: `Promise<Types.DailyIndexData[] | null>`
- Description: Returns time-series data for a market index.

### market.getIndexChart

```typescript
client.market.getIndexChart(indexCode, period)
```

- `indexCode` `<string>`: Target index code
- `period` `<string>`: (Optional) Time frame (1D, 1W, 1M, 1Q, 1Y). Defaults to `'1D'`.
- Returns: `Promise<Types.IndexChartResponse | null>`
- Description: Returns time-series data for a specific index.

### market.getIndexList

```typescript
client.market.getIndexList()
```

- Returns: `Promise<Types.IndexData[] | null>`
- Description: Returns current prices and changes for all indices.

### market.getSectoralMovement

```typescript
client.market.getSectoralMovement(year, month)
```

- `year` `<number>`: Target year
- `month` `<number>`: Target month (1-12)
- Returns: `Promise<Types.SectoralMovementResponse | null>`
- Description: Returns performance comparison between indices over time.

### participants.getBrokerSearch

```typescript
client.participants.getBrokerSearch(start, length)
```

- `start` `<number>`: (Optional) Pagination start index. Defaults to 0.
- `length` `<number>`: (Optional) Maximum record count. Defaults to 9999.
- Returns: `Promise<Types.BrokerProfile[] | null>`
- Description: Returns list of registered exchange brokers.

### participants.getParticipantSearch

```typescript
client.participants.getParticipantSearch(start, length, codeOrName, license)
```

- `start` `<number>`: (Optional) Pagination start index. Defaults to 0.
- `length` `<number>`: (Optional) Maximum record count. Defaults to 9999.
- `codeOrName` `<string>`: (Optional) Filter by code or name. Defaults to `''`.
- `license` `<string>`: (Optional) Filter by license type. Defaults to `''`.
- Returns: `Promise<Types.PaginatedResponse<Types.ParticipantProfile> | null>`
- Description: Returns paginated list of market participants.

### participants.getPrimaryDealerSearch

```typescript
client.participants.getPrimaryDealerSearch(start, length, codeOrName, license)
```

- `start` `<number>`: (Optional) Pagination start index. Defaults to 0.
- `length` `<number>`: (Optional) Maximum record count. Defaults to 9999.
- `codeOrName` `<string>`: (Optional) Filter by code or name. Defaults to `''`.
- `license` `<string>`: (Optional) Filter by license type. Defaults to `''`.
- Returns: `Promise<Types.PaginatedResponse<Types.PrimaryDealerProfile> | null>`
- Description: Returns paginated list of primary dealers.

### statistics.discover

```typescript
client.statistics.discover(featureList)
```

- `featureList` `<Types.DigitalFeatures[]>`: Features to process for discovery
- Returns: `Promise<string>`
- Description: Maps features into a markdown summary table.

### statistics.saveOutput

```typescript
client.statistics.saveOutput(content, fileName)
```

- `content` `<string>`: Markdown content to save
- `fileName` `<string>`: (Optional) Target destination file path. Defaults to `'Draft_Statistic_API.md'`.
- Returns: `Promise<void>`
- Description: Writes generated markdown to a physical file.

### trading.getBrokerSummary

```typescript
client.trading.getBrokerSummary(date, start, length)
```

- `date` `<string>`: Date in YYYYMMDD format
- `start` `<number>`: (Optional) Start record index. Defaults to 0.
- `length` `<number>`: (Optional) Maximum record count. Defaults to 9999.
- Returns: `Promise<Types.TradingResponse<Types.BrokerSummary> | null>`
- Description: Returns paginated broker activity and trading summary.

### trading.getDomesticTradingSummary

```typescript
client.trading.getDomesticTradingSummary(year, month)
```

- `year` `<number>`: Target year
- `month` `<number>`: Target month (1-12)
- Returns: `Promise<Types.InvestorTradingSummary[] | null>`
- Description: Returns domestic investor daily trading activity metrics.

### trading.getForeignTradingSummary

```typescript
client.trading.getForeignTradingSummary(year, month)
```

- `year` `<number>`: Target year
- `month` `<number>`: Target month (1-12)
- Returns: `Promise<Types.InvestorTradingSummary[] | null>`
- Description: Returns foreign investor daily trading activity metrics.

### trading.getIndexSummary

```typescript
client.trading.getIndexSummary(date, start, length)
```

- `date` `<string>`: Date in YYYYMMDD format
- `start` `<number>`: (Optional) Start record index. Defaults to 0.
- `length` `<number>`: (Optional) Maximum record count. Defaults to 9999.
- Returns: `Promise<Types.TradingResponse<Types.IndexSummary> | null>`
- Description: Returns performance data for market indices.

### trading.getIndustryTradingSummary

```typescript
client.trading.getIndustryTradingSummary(year, month)
```

- `year` `<number>`: Target year
- `month` `<number>`: Target month (1-12)
- Returns: `Promise<Types.IndustryTradingSummary[] | null>`
- Description: Returns aggregate trading data classified by industry subset.

### trading.getMostActiveByFrequency

```typescript
client.trading.getMostActiveByFrequency(year, month)
```

- `year` `<number>`: Target year
- `month` `<number>`: Target month (1-12)
- Returns: `Promise<Types.ActiveStockResponse | null>`
- Description: Returns paginated list of top active stocks by frequency.

### trading.getMostActiveByValue

```typescript
client.trading.getMostActiveByValue(year, month)
```

- `year` `<number>`: Target year
- `month` `<number>`: Target month (1-12)
- Returns: `Promise<Types.ActiveStockResponse | null>`
- Description: Returns paginated list of top active stocks by value.

### trading.getMostActiveByVolume

```typescript
client.trading.getMostActiveByVolume(year, month)
```

- `year` `<number>`: Target year
- `month` `<number>`: Target month (1-12)
- Returns: `Promise<Types.ActiveStockResponse | null>`
- Description: Returns paginated list of top active stocks by volume.

### trading.getStockSummary

```typescript
client.trading.getStockSummary(date)
```

- `date` `<string>`: Date in YYYYMMDD format
- Returns: `Promise<Types.StockSummary[] | null>`
- Description: Detailed stock summaries with OHLC data.

### trading.getTopGainers

```typescript
client.trading.getTopGainers(year, month)
```

- `year` `<number>`: Target year
- `month` `<number>`: Target month (1-12)
- Returns: `Promise<Types.TopStockSummary[] | null>`
- Description: Returns list of top 20 gaining stocks.

### trading.getTopLosers

```typescript
client.trading.getTopLosers(year, month)
```

- `year` `<number>`: Target year
- `month` `<number>`: Target month (1-12)
- Returns: `Promise<Types.TopStockSummary[] | null>`
- Description: Returns list of top 20 losing stocks.

### trading.getTradeSummary

```typescript
client.trading.getTradeSummary()
```

- Returns: `Promise<Types.TradeSummary[] | null>`
- Description: General market segment trading aggregate data.

### trading.getTradingInfoDaily

```typescript
client.trading.getTradingInfoDaily(companyCode)
```

- `companyCode` `<string>`: Company ticker code
- Returns: `Promise<Types.TradingInfoDaily | null>`
- Description: Price and volume data for a trading day.

### trading.getTradingInfoSS

```typescript
client.trading.getTradingInfoSS(companyCode, start, length)
```

- `companyCode` `<string>`: Company ticker code
- `start` `<number>`: (Optional) Starting record index. Defaults to 0.
- `length` `<number>`: (Optional) Maximum record count. Defaults to 1000.
- Returns: `Promise<Types.TradingInfoSS[] | null>`
- Description: Historical trading summary data for a stock.

## Notes and Limits

- **Rate Limiting**: IDX APIs may have rate limits, implement delays between requests
- **Data Freshness**: Some data updates once daily, check sync schedules
- **File Storage**: SQLite database grows over time, consider cleanup strategies
- **Network Dependency**: Requires internet connection for API access
- **Timezone**: IDX operates in WIB (GMT+7), adjust timestamps accordingly
