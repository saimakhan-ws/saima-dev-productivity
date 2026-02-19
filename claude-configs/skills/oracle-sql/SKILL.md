# Oracle SQL Skill

**Trigger:** Use this skill when generating Oracle EBS SQL queries for ad-hoc investigation — journals, posting/unposted status, GL batches/headers/lines, assets, listings, accounts, XXBRK entries, GL Interface, reversals, idempotency key lookups.

Schema prefixes: GL tables can be accessed via either `APPS.GL_*` or `GL.GL_*` — both work. XXBRK tables use `APPS.XXBRK_*` or `XXBRK.XXBRK_*`.
For **historical data** (archived journals), use `XXGLARC_*` views instead of `GL_JE_*` tables — they union live + historical data.
Queries are for **ad-hoc investigation** (SQL Developer / DB client). Use `&variable` or `:variable` substitution syntax.

---

## Schema

### GL Core

**GL_INTERFACE** — staging table; entries here haven't been imported yet (`STATUS = 'NEW'`)
| Column | Notes |
|---|---|
| `GROUP_ID` | batch group; not unique across sources |
| `USER_JE_SOURCE_NAME` | source system name |
| `USER_JE_CATEGORY_NAME` | journal category |
| `ACCOUNTING_DATE` | effective date |
| `CURRENCY_CODE` | CAD, USD, STAT, etc. |
| `SEGMENT1–6` | COA segments (see GL_CODE_COMBINATIONS) |
| `ENTERED_DR / ENTERED_CR` | debit/credit in entered currency |
| `ATTRIBUTE1` | process date |
| `ATTRIBUTE2` | settlement date |
| `ATTRIBUTE3` | transaction type code |
| `ATTRIBUTE4` | taxable flag (Y/N) |
| `ATTRIBUTE5` | reference type |
| `ATTRIBUTE6` | external source ID |
| `ATTRIBUTE7` | quantity |
| `ATTRIBUTE8` | price |
| `ATTRIBUTE9` | commission |
| `ATTRIBUTE10` | FX rate |
| `REFERENCE1` | batch name |
| `REFERENCE4 / REFERENCE6` | external reference |
| `REFERENCE21` | transaction group ID |
| `REFERENCE30` | record ID |
| `STATUS` | 'NEW' = not yet imported |

**GL_JE_BATCHES** — journal entry batches
| Column | Notes |
|---|---|
| `JE_BATCH_ID` | PK (sequence GL_JE_BATCHES_S) |
| `NAME` | batch name |
| `STATUS` | **U** = Unposted, **P** = Posted |
| `DEFAULT_EFFECTIVE_DATE` | |
| `DEFAULT_PERIOD_NAME` | e.g. 'JAN-25' |
| `POSTED_DATE` | when posted (null if unposted) |
| `RUNNING_TOTAL_DR / CR` | entered currency totals |
| `RUNNING_TOTAL_ACCOUNTED_DR / CR` | functional currency totals |
| `GROUP_ID` | links back to GL_INTERFACE group |

**GL_JE_HEADERS** — one per journal entry, belongs to a batch
| Column | Notes |
|---|---|
| `JE_HEADER_ID` | PK |
| `JE_BATCH_ID` | FK → GL_JE_BATCHES |
| `NAME` | header name |
| `STATUS` | **U** = Unposted, **P** = Posted |
| `PERIOD_NAME` | accounting period |
| `CURRENCY_CODE` | |
| `JE_SOURCE` | source system |
| `JE_CATEGORY` | category |
| `DEFAULT_EFFECTIVE_DATE` | |
| `POSTED_DATE` | |
| `EXTERNAL_REFERENCE` | **idempotency key** of originating activity |
| `REVERSED_JE_HEADER_ID` | ID of the header this one reversed |
| `ACCRUAL_REV_STATUS` | 'R' = this header has been reversed |
| `ACCRUAL_REV_JE_HEADER_ID` | peer header in reversal pair |

**GL_JE_LINES** — individual debit/credit lines
| Column | Notes |
|---|---|
| `JE_HEADER_ID` | PK (composite with JE_LINE_NUM) |
| `JE_LINE_NUM` | PK (composite) |
| `CODE_COMBINATION_ID` | FK → GL_CODE_COMBINATIONS |
| `STATUS` | U / P |
| `EFFECTIVE_DATE` | |
| `PERIOD_NAME` | |
| `ENTERED_DR / ENTERED_CR` | debit/credit entered currency |
| `ACCOUNTED_DR / ACCOUNTED_CR` | debit/credit functional currency |
| `DESCRIPTION` | |
| `ATTRIBUTE1` | trade date |
| `ATTRIBUTE2` | settlement date |
| `ATTRIBUTE3` | transaction type code |
| `ATTRIBUTE4` | taxable flag (Y/N) |
| `ATTRIBUTE5` | reference type |
| `ATTRIBUTE6` | external source ID |
| `ATTRIBUTE7` | quantity |
| `ATTRIBUTE8` | price (in asset's market currency) |
| `ATTRIBUTE9` | commission |
| `ATTRIBUTE10` | FX rate |
| `ATTRIBUTE11` | book value DR |
| `ATTRIBUTE12` | book value CR |
| `ATTRIBUTE16` | settlement processed flag (Y/N/null) |
| `ATTRIBUTE17` | related asset ID |
| `ATTRIBUTE19` | reservation ID |
| `REFERENCE_1` | order ID |
| `REFERENCE_4` | shovel view flag (Y/N) |
| `REFERENCE_5` | transaction subtype |
| `REFERENCE_6` | processed timestamp |
| `REFERENCE_10` | unique reversal line identifier |

**GL_CODE_COMBINATIONS** — chart of accounts (immutable reference)
| Column | Notes |
|---|---|
| `CODE_COMBINATION_ID` | PK |
| `SEGMENT1` | company (e.g. 'WS') |
| `SEGMENT2` | business unit (e.g. 'TR') |
| `SEGMENT3` | natural account |
| `SEGMENT4` | sub account / **ACCT_ID** (client or custodian account) |
| `SEGMENT5` | listing ID or asset ID |
| `SEGMENT6` | position qualifier: **CP**=Current, **PP**=Pending, **LP**=Loaned, **SP**=Staked |
| `ENABLED_FLAG` | Y/N |

Full account key: `COMPANY.BU.NATURAL_ACCT.ACCT_ID.LISTING_OR_ASSET.POSITION`
Example: `WS.TR.120110.H00123456CAD.CAD.CP`

---

### XXGLARC Archive Views (prefer for full history)

`APPS.XXGLARC_GL_JE_BATCHES` — union of GL_JE_BATCHES + XXGLARC_GL_JE_BATCHES_HIST
`APPS.XXGLARC_GL_JE_HEADERS` — union of GL_JE_HEADERS + XXGLARC_GL_JE_HEADERS_HIST
`APPS.XXGLARC_GL_JE_LINES` — union of GL_JE_LINES + XXGLARC_GL_JE_LINES_HIST

Same columns as their GL_* counterparts. Use these when journals may have been archived.

---

### XXBRK Custom Tables

**XXBRKACCT** — broker/client account master
| Column | Notes |
|---|---|
| `ACCT_ID` | PK (12 chars, e.g. 'H00123456CAD') |
| `ACCT_NAME` | display name |
| `ACCT_STATUS` | 'OPEN', 'CLOSED', etc. |
| `ACCT_TYPE` | FK → XXBRK_ACCT_TYPE (acct_type_id) |
| `CURRENCY` | account currency |
| `COMPANY` | e.g. 'WS' |
| `BUSINESS_UNIT` | e.g. 'TR' |
| `NATURAL_ACCOUNT` | GL natural account |
| `COMMISSION_TYPE_ID` | |
| `OUTSTANDING_DIVIDENDS_TO` | FK → XXBRKACCT (acct_id) |
| `DELIVERY_ACCT_ID` | delivery account |
| `BRANCH_ID` | |
| `OWNERSHIP_TYPE` | |
| `ENTITY_ID` | Wealthsimple entity ID |
| `CLOSE_DATE` | set when ACCT_STATUS = 'CLOSED' |

**XXBRK_ACCT_TYPE** — account type reference
| Column | Notes |
|---|---|
| `ACCT_TYPE_ID` | PK (1 char) |
| `ACCT_NAME` | e.g. 'TFSA', 'RRSP' |
| `REGISTERED` | Y/N |
| `SEGREGATED` | Y/N |
| `CLIENT_ACCOUNT` | Y/N |
| `BROKER_ACCOUNT` | Y/N |
| `INVENTORY` | Y/N |

**XXBRK_ASSETS** — security / asset master
| Column | Notes |
|---|---|
| `ASSET_ID` | PK (20 chars) |
| `ASSET_NAME` | display name |
| `ISIN` | e.g. 'CA0679011084' |
| `CUSIP` | |
| `ASSET_TYPE` | |
| `ASSET_CLASS` | e.g. 'EQUITY' |
| `DEFAULT_LISTING_ID` | FK → XXBRK_LISTINGS (primary listing) |
| `START_DATE_ACTIVE / END_DATE_ACTIVE` | active window |
| `MATURITY_DATE` | for fixed income |
| `COUNTRY_OF_ISSUE_CODE` | |
| `P_AND_L_SEGMENT_3` | natural account for P&L |
| `DIVIDEND_TAX_WITHHOLDING_RATE` | |

**XXBRK_LISTINGS** — asset listing by market
| Column | Notes |
|---|---|
| `LISTING_ID` | PK (25 chars) |
| `ASSET_ID` | FK → XXBRK_ASSETS |
| `MARKET_ID` | FK → XXBRK_MARKETS |
| `LISTING_SYMBOL` | trading symbol (4 chars) |
| `LISTING_CURRENCY_CODE` | market currency |
| `LISTING_EFFECTIVE_DATE / LISTING_EXPIRATION_DATE` | active window |
| `SECURITIES_API_ID` | external ID from securities API |
| `ORIG_SYS_REFERENCE` | original system reference |
| `SETTLEMENT_PERIOD_DAYS` | T+N settlement |
| `COMPANY / BUSINESS_UNIT` | |

**XXBRK_MARKETS** — market / exchange reference
| Column | Notes |
|---|---|
| `MARKET_ID` | PK |
| `MARKET_SYMBOL` | e.g. 'TSX' |
| `MARKET_SHORT_NAME` | |
| `MARKET_NAME` | full name |

**XXBRK_FPL_BROKER_ACCOUNTS** — FPL broker account mappings
| Column | Notes |
|---|---|
| `INTERNAL_ACCOUNT_ID` | PK (12 chars), same as XXBRKACCT.ACCT_ID |
| `BROKER_NAME` | |
| `EXTERNAL_WEALTHSIMPLE_ID` | |
| `ASSET_USAGE_TYPE` | |
| `CURRENCY` | |
| `STANDARD_SETTLEMENT_INSTRUCTIONS_ID` | SSI ID |

**XXBRK_ORDER_BATCHES** — order entry batches
| Column | Notes |
|---|---|
| `ORDER_BATCH_ID` | PK |
| `ASSET_ID` | FK → XXBRK_ASSETS |
| `LISTING_ID` | FK → XXBRK_LISTINGS |
| `BATCH_STATUS` | |
| `BATCH_EFFECTIVE_DATE` | |
| `ORDERS_SERVICE_ID` | external orders service reference |
| `BATCH_COMPANY / BATCH_BUSINESS_UNIT` | |

**XXBRK_ORDER_HEADERS** — individual orders in a batch
| Column | Notes |
|---|---|
| `ORDER_HEADER_ID` | PK |
| `ORDER_BATCH_ID` | FK → XXBRK_ORDER_BATCHES |
| `ORDER_ACCOUNT_ID` | FK → XXBRKACCT (acct_id) |
| `ORDER_STATUS` | |
| `ORDER_QUANTITY` | |
| `ORDER_CURRENCY` | |
| `ORDER_TYPE_ID` | |
| `ORDER_SUB_TYPE_ID` | |

---

### Other Reference Tables

**GL_DAILY_RATES** — FX conversion rates
| Column | Notes |
|---|---|
| `FROM_CURRENCY` | source currency |
| `TO_CURRENCY` | target currency |
| `CONVERSION_DATE` | |
| `CONVERSION_RATE` | |
| `CONVERSION_TYPE` | e.g. 'User', 'Corporate' |

**XXBRK_GL_WRITER_ACTIVITY_IMPORT** — idempotency tracking for GL writes
| Column | Notes |
|---|---|
| `IDEMPOTENCY_KEY` | PK; matches GL_JE_HEADERS.EXTERNAL_REFERENCE |
| `STATUS` | NEW / PROCESSED / FAILED |
| `GROUP_ID` | GL_INTERFACE group_id |
| `CREATED_AT / UPDATED_AT` | |
| `REVERSED_BY_IDEMPOTENCY_KEY` | set when this activity was reversed |

---

## Relationship Map

```
GL_INTERFACE
  └─ (Oracle import process) ─►
GL_JE_BATCHES ──(je_batch_id)──► GL_JE_HEADERS ──(je_header_id)──► GL_JE_LINES
                                                                         │
                                                                 (code_combination_id)
                                                                         │
                                                                 GL_CODE_COMBINATIONS
                                                                   segment4 = XXBRKACCT.acct_id
                                                                   segment5 = XXBRK_LISTINGS.listing_id
                                                                              or XXBRK_ASSETS.asset_id

GL_JE_HEADERS.external_reference  ◄──► XXBRK_GL_WRITER_ACTIVITY_IMPORT.idempotency_key
GL_JE_HEADERS.reversed_je_header_id → ID of the header this reversed
GL_JE_HEADERS.accrual_rev_je_header_id → reversal pair partner

XXBRKACCT.acct_type ──► XXBRK_ACCT_TYPE.acct_type_id
XXBRK_ASSETS.default_listing_id ──► XXBRK_LISTINGS.listing_id
XXBRK_LISTINGS.asset_id ──► XXBRK_ASSETS.asset_id
XXBRK_LISTINGS.market_id ──► XXBRK_MARKETS.market_id
XXBRK_ORDER_HEADERS.order_batch_id ──► XXBRK_ORDER_BATCHES.order_batch_id
XXBRK_ORDER_HEADERS.order_account_id ──► XXBRKACCT.acct_id

XXGLARC_GL_JE_BATCHES  = GL_JE_BATCHES  UNION XXGLARC_GL_JE_BATCHES_HIST   (same columns)
XXGLARC_GL_JE_HEADERS  = GL_JE_HEADERS  UNION XXGLARC_GL_JE_HEADERS_HIST   (same columns)
XXGLARC_GL_JE_LINES    = GL_JE_LINES    UNION XXGLARC_GL_JE_LINES_HIST     (same columns)
```

---

## Query Patterns

### Posting / Unposted Status
- Filter `GL_JE_BATCHES.STATUS = 'U'` for unposted batches, `'P'` for posted
- Same `STATUS` column exists on `GL_JE_HEADERS` and `GL_JE_LINES`
- `POSTED_DATE` is NULL when unposted
- Join path: `GL_JE_BATCHES → GL_JE_HEADERS ON je_batch_id`

### Journal Detail (Batch → Lines)
- Start from `GL_JE_BATCHES` (filter on `NAME` or `JE_BATCH_ID`)
- Join `GL_JE_HEADERS ON je_batch_id`; filter on `EXTERNAL_REFERENCE` for idempotency key lookup
- Join `GL_JE_LINES ON je_header_id`
- Join `GL_CODE_COMBINATIONS ON code_combination_id` to decode account segments
- Use `XXGLARC_*` views instead of `GL_*` tables for full history

### Find Journals by Idempotency Key
- `GL_JE_HEADERS.EXTERNAL_REFERENCE = '<idempotency_key>'`
- Also check `XXBRK_GL_WRITER_ACTIVITY_IMPORT.IDEMPOTENCY_KEY` for import status and `REVERSED_BY_IDEMPOTENCY_KEY`

### Journals for an Account
- `GL_CODE_COMBINATIONS.SEGMENT4 = '<acct_id>'`
- Join `GL_JE_LINES ON code_combination_id` → `GL_JE_HEADERS ON je_header_id`
- Filter by `PERIOD_NAME`, `EFFECTIVE_DATE`, or `SEGMENT3` (natural account) as needed
- Add `SEGMENT5` filter to narrow to a specific listing or asset

### Asset Lookup
- By ISIN: `XXBRK_ASSETS.ISIN = '<isin>'`
- By CUSIP: `XXBRK_ASSETS.CUSIP = '<cusip>'`
- By ID: `XXBRK_ASSETS.ASSET_ID = '<asset_id>'`
- Join `XXBRK_LISTINGS ON asset_id` for market symbols, currencies, listing IDs
- Join `XXBRK_MARKETS ON market_id` for exchange name

### Listing Lookup
- By symbol: `XXBRK_LISTINGS.LISTING_SYMBOL = '<symbol>'` (4 chars)
- By securities API ID: `XXBRK_LISTINGS.SECURITIES_API_ID = '<id>'`
- By listing ID: `XXBRK_LISTINGS.LISTING_ID = '<id>'`
- Filter `LISTING_EXPIRATION_DATE IS NULL OR LISTING_EXPIRATION_DATE > SYSDATE` for active listings
- Join `XXBRK_ASSETS ON asset_id` for ISIN/CUSIP

### Account Details and Type
- `XXBRKACCT A JOIN XXBRK_ACCT_TYPE T ON A.ACCT_TYPE = T.ACCT_TYPE_ID`
- Filter by `ACCT_ID`, `ACCT_NAME`, or `ENTITY_ID`
- `ACCT_STATUS = 'OPEN'` / `'CLOSED'`; `CLOSE_DATE` for when it closed

### XXBRK GL Interface Entries
- `GL_INTERFACE WHERE USER_JE_SOURCE_NAME = '<source>'`
- Filter by `GROUP_ID`, `ACCOUNTING_DATE`, `CURRENCY_CODE`, or segment values
- `STATUS = 'NEW'` for records not yet imported

### Reversal Tracking
- This header reversed another: `GL_JE_HEADERS.REVERSED_JE_HEADER_ID IS NOT NULL`
- This header was reversed: `GL_JE_HEADERS.ACCRUAL_REV_STATUS = 'R'`
- Find reversal pair: `ACCRUAL_REV_JE_HEADER_ID` links both directions
- At line level: `REFERENCE_10` is the unique per-line reversal identifier

### GL Balances by Account + Period
- `APPS.GL_BALANCES WHERE CODE_COMBINATION_ID = <id> AND PERIOD_NAME = '<period>' AND CURRENCY_CODE = '<currency>'`
- Columns: `PERIOD_NET_DR`, `PERIOD_NET_CR`, `BEGIN_BALANCE_DR`, `BEGIN_BALANCE_CR`

### FX Rates
- `GL_DAILY_RATES WHERE FROM_CURRENCY = 'USD' AND TO_CURRENCY = 'CAD' AND CONVERSION_DATE = DATE '<date>'`

---

## Query Templates

### Canonical SELECT columns (reuse across queries)
```sql
-- Core columns (always useful)
b.JE_BATCH_ID, b.NAME AS batch_name, b.STATUS AS batch_status,
h.JE_HEADER_ID, h.NAME AS journal_name, h.EXTERNAL_REFERENCE,
h.CURRENCY_CODE, h.JE_CATEGORY, h.PERIOD_NAME,
l.JE_LINE_NUM, l.EFFECTIVE_DATE,
l.ENTERED_DR, l.ENTERED_CR,
l.DESCRIPTION,
l.ATTRIBUTE7 AS quantity, l.ATTRIBUTE8 AS price,
l.ATTRIBUTE11 AS book_value_dr, l.ATTRIBUTE12 AS book_value_cr

-- Add COA segments when you need account breakdown
c.SEGMENT3 AS natural_account, c.SEGMENT4 AS sub_account,
c.SEGMENT5 AS asset_id, c.SEGMENT6 AS position_type

-- Full precision amounts (avoids rounding in SQL Developer)
TO_CHAR(l.ENTERED_DR, '99999999999999999999.9999999999999999') AS entered_dr_full,
TO_CHAR(l.ENTERED_CR, '99999999999999999999.9999999999999999') AS entered_cr_full
```

### Standard join chain
```sql
FROM GL.GL_JE_HEADERS h
JOIN GL.GL_JE_BATCHES b          ON h.JE_BATCH_ID        = b.JE_BATCH_ID
JOIN GL.GL_JE_LINES l            ON h.JE_HEADER_ID        = l.JE_HEADER_ID
JOIN GL.GL_CODE_COMBINATIONS c   ON l.CODE_COMBINATION_ID = c.CODE_COMBINATION_ID
-- Note: some queries also add AND h.PERIOD_NAME = l.PERIOD_NAME to the lines join
```

### By batch name
```sql
WHERE b.NAME = 'Broker Positions A 373542060 865358645'
ORDER BY h.CURRENCY_CODE, l.JE_LINE_NUM;
```

### By batch ID
```sql
WHERE b.JE_BATCH_ID = 1655552119
ORDER BY h.JE_HEADER_ID, l.JE_LINE_NUM;
```

### By JE_HEADER_ID (single or list)
```sql
WHERE h.JE_HEADER_ID IN (1506563780, 1923485470)
ORDER BY l.JE_LINE_NUM;
```

### By idempotency key (EXTERNAL_REFERENCE)
```sql
WHERE h.EXTERNAL_REFERENCE = 'bulk-mj-abc123'
-- or prefix search:
WHERE h.EXTERNAL_REFERENCE LIKE 'bulk-mj-%'
```

### Find bulk batches by external_reference prefix (with counts)
```sql
SELECT b.JE_BATCH_ID, b.NAME AS batch_name, b.STATUS,
       h.EXTERNAL_REFERENCE, COUNT(l.JE_LINE_NUM) AS line_count
FROM APPS.GL_JE_BATCHES b
JOIN APPS.GL_JE_HEADERS h ON b.JE_BATCH_ID = h.JE_BATCH_ID
JOIN APPS.GL_JE_LINES l   ON h.JE_HEADER_ID = l.JE_HEADER_ID
WHERE h.EXTERNAL_REFERENCE LIKE 'bulk-mj-%'
GROUP BY b.JE_BATCH_ID, b.NAME, b.STATUS, h.EXTERNAL_REFERENCE
ORDER BY b.JE_BATCH_ID DESC
FETCH FIRST 20 ROWS ONLY;
```

### By sub-account (SEGMENT4) — posted, specific currency
```sql
WHERE c.SEGMENT4 = 'HJ7322119CAD'
  AND h.CURRENCY_CODE = 'STAT'
  AND b.STATUS = 'P'
ORDER BY h.PERIOD_NAME, h.JE_HEADER_ID, l.JE_LINE_NUM;
```

### By sub-account + date range
```sql
WHERE c.SEGMENT4 = 'HJ7322119CAD'
  AND h.CURRENCY_CODE = 'STAT'
  AND b.STATUS = 'P'
  AND l.EFFECTIVE_DATE >= TO_DATE('2024-08-01', 'YYYY-MM-DD')
ORDER BY l.EFFECTIVE_DATE, h.JE_HEADER_ID, l.JE_LINE_NUM;
```

### XXBRK asset / listing lookup
```sql
SELECT * FROM XXBRK.XXBRK_ASSETS   WHERE ASSET_ID   = '00000000000000000006';
SELECT * FROM XXBRK.XXBRK_LISTINGS WHERE ASSET_ID   = '00000000000000014875';
SELECT * FROM XXBRK.XXBRK_ASSETS   WHERE ISIN       = 'CA0679011084';
SELECT * FROM XXBRK.XXBRK_ASSETS   WHERE CUSIP      = '12345678';
```

### Investigate "No active listing found" error for a listing ID
```sql
-- 1. Check listing exists + active window + linked asset/market
SELECT
    l.LISTING_ID, l.ASSET_ID, l.LISTING_SYMBOL, l.LISTING_CURRENCY_CODE,
    l.LISTING_EFFECTIVE_DATE, l.LISTING_EXPIRATION_DATE, l.LISTING_PRIORITY,
    l.SECURITIES_API_ID, l.ORIG_SYS_REFERENCE,
    m.MARKET_SYMBOL, m.MARKET_NAME,
    a.ASSET_NAME, a.ISIN, a.CUSIP, a.DEFAULT_LISTING_ID,
    a.START_DATE_ACTIVE AS asset_start_active,
    a.END_DATE_ACTIVE   AS asset_end_active
FROM XXBRK.XXBRK_LISTINGS l
JOIN XXBRK.XXBRK_ASSETS  a ON l.ASSET_ID  = a.ASSET_ID
JOIN XXBRK.XXBRK_MARKETS m ON l.MARKET_ID = m.MARKET_ID
WHERE l.LISTING_ID = '00000000000000014875';

-- 2. Find all listings for the same asset (spot which one is active)
SELECT
    l.LISTING_ID, l.LISTING_SYMBOL, l.LISTING_CURRENCY_CODE,
    l.LISTING_EFFECTIVE_DATE, l.LISTING_EXPIRATION_DATE, l.LISTING_PRIORITY,
    m.MARKET_SYMBOL,
    CASE WHEN l.LISTING_EXPIRATION_DATE IS NULL
              OR l.LISTING_EXPIRATION_DATE > SYSDATE THEN 'ACTIVE' ELSE 'EXPIRED' END AS listing_status
FROM XXBRK.XXBRK_LISTINGS l
JOIN XXBRK.XXBRK_MARKETS m ON l.MARKET_ID = m.MARKET_ID
WHERE l.ASSET_ID = (SELECT ASSET_ID FROM XXBRK.XXBRK_LISTINGS WHERE LISTING_ID = '00000000000000014875')
ORDER BY l.LISTING_PRIORITY, l.LISTING_EFFECTIVE_DATE;
```
-- If query 1 returns nothing → listing ID doesn't exist in Oracle
-- If query 1 returns a row → check LISTING_EXPIRATION_DATE (past date = inactive)
-- Query 2 shows all sibling listings and which is currently active / what DEFAULT_LISTING_ID points to
