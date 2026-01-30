# Ledge Bulk Journal Test Data Generation

Scripts for generating bulk journal CSV test data for crypto write-offs in Ledge.

## Files

- `generate_bulk_writeoff.py` - Generate valid bulk journal CSV files (happy path)
- `generate_error_scenarios.py` - Generate CSV files with various error scenarios
- `staging_data_queries.sql` - Oracle SQL queries to extract valid staging data

## Prerequisites

- Python 3.x
- Access to staging Oracle (SWS2E) via SQL Developer (for updating data pools)

## Usage

### Generate Test Data

```bash
# Happy path - 10k balanced entries
python generate_bulk_writeoff.py --entries 10000 --output test.csv

# Large scale - 500k entries (~150MB, ~3 seconds)
python generate_bulk_writeoff.py --entries 500000 --output large.csv

# Error case - unbalanced DR/CR (for testing validation)
python generate_bulk_writeoff.py --entries 1000 --unbalanced --output errors.csv

# Specific accounting date
python generate_bulk_writeoff.py --entries 1000 --date 2026-02-01 --output dated.csv

# Use inter-account transfers instead of write-off accounts
python generate_bulk_writeoff.py --entries 1000 --no-writeoff-accounts --output inter_account.csv
```

### Generate Error Scenarios

Generate files with mostly valid entries and a configurable percentage of errors:

```bash
# 1000 entries with 10% errors at the end (90 valid, then 10 errors)
python generate_error_scenarios.py --entries 1000 --error-percent 10 --output mixed.csv

# 1000 entries with 5% errors shuffled throughout
python generate_error_scenarios.py --entries 1000 --error-percent 5 --shuffle --output scattered.csv

# Specific error type only (10% unbalanced errors)
python generate_error_scenarios.py --entries 1000 --error-percent 10 --error-type unbalanced --output unbalanced.csv

# 100% errors (all entries are errors)
python generate_error_scenarios.py --entries 100 --error-percent 100 --output all_errors.csv
```

**Options:**
- `--error-percent`: Percentage of entries with errors (default: 10)
- `--shuffle`: Scatter errors throughout instead of placing them at the end
- `--error-type`: Use only one error type (default: mixed)

**Available error types:**

| Error Type | Description | Expected Failure Point |
|------------|-------------|------------------------|
| `unbalanced` | DR != CR amounts | GL Publisher validation |
| `invalid-asset` | Non-existent asset ID | GL Publisher lookup |
| `invalid-account` | Non-existent sub-account | GL Publisher lookup |
| `invalid-natural-acct` | Mismatched natural account | GL import validation |
| `future-date` | Date 30+ days in future | GL period validation |
| `past-date` | Date in closed period (>2 years) | GL period validation |
| `missing-amount` | Both DR and CR empty | GL Publisher validation |
| `negative-amount` | Negative amounts | GL import validation |
| `zero-amount` | Zero amounts | GL import validation |

### Output Format

Each entry generates 2 CSV rows:
1. **DEL (Delivery)** - Debit line from source account
2. **REC (Receipt)** - Credit line to write-off account

Example:
```csv
ENTRY_NUM,JIRA_ID,ASSET_ID,...,SUB_ACCT,TRANS_CODE,...,ENTERED_DR,ENTERED_CR,...
1,DCOE-TEST,00000000000000026236,...,HQ0243B17CAD,DEL,...,0.0000610400,,...
1,DCOE-TEST,00000000000000026236,...,WK05833K9CAD,REC,...,,0.0000610400,...
```

### Performance

| Entries | Rows | Time | File Size |
|---------|------|------|-----------|
| 10,000 | 20,000 | ~0.1s | ~3 MB |
| 100,000 | 200,000 | ~0.5s | ~30 MB |
| 500,000 | 1,000,000 | ~2.5s | ~150 MB |

## Data Pools

The script contains embedded staging data:

- **8 crypto assets**: BTC, ETH, SOL, ADA, DOGE, USDC, AAVE, 1INCH
- **562 source accounts**: Client accounts with crypto holdings
- **20 write-off accounts**: Destination accounts for write-offs

### Updating Data Pools

If you need to refresh the data pools:

1. Run `staging_data_queries.sql` in SQL Developer (connected to SWS2E)
2. Export Query 2 results and update `RAW_DATA` in the Python script
3. Export Query 3 results and update `WRITEOFF_ACCOUNTS` in the Python script

## CSV Column Reference

| Column | Description | Example |
|--------|-------------|---------|
| ENTRY_NUM | Groups related lines | 1 |
| JIRA_ID | Ticket reference | DCOE-TEST |
| ASSET_ID | 20-char padded asset ID | 00000000000000026236 |
| POSITION | Position type | CP (Client Position) |
| ACCOUNTING_DATE | Journal date | 2026-01-30 |
| NATURAL_ACCT | GL natural account | 000000 |
| SUB_ACCT | Client account ID | HQ0243B17CAD |
| TRANS_CODE | DEL (debit) or REC (credit) | DEL |
| CURRENCY | Always STAT for quantity | STAT |
| ENTERED_DR | Debit amount (empty for REC) | 0.0000610400 |
| ENTERED_CR | Credit amount (empty for DEL) | 0.0000610400 |
