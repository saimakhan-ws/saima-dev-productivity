---
name: verify-bulk-mj
description: Use when verifying bulk manual journal uploads landed correctly — reads the upload CSV, queries Ledge via Preset to get idempotency keys and line statuses, then generates Oracle EBS SQL to cross-reference GL journals
---

# Verify Bulk Manual Journal Upload

**Trigger:** User wants to confirm a bulk manual journal CSV upload was ledgered correctly in Oracle EBS. They will provide the CSV file path.

---

## Workflow

### Step 1: Read the CSV

Read the user-provided CSV file. Extract key fields:
- **ENTRY_NUM** — groups lines into journal entries
- **JIRA_ID** — the associated JIRA ticket
- **ASSET_ID**, **SUB_ACCT**, **NATURAL_ACCT**, **POSITION**
- **CURRENCY**, **ENTERED_DR**, **ENTERED_CR**
- **ACCOUNTING_DATE**, **TRANS_CODE**, **TRANS_SUBCODE**
- **BUSINESS_UNIT**, **LINE_DESCRIPTION**

Note the total number of entries (distinct ENTRY_NUM values) and total lines.

### Step 2: Find the upload in Ledge via Preset

Query the `ledge.bulk_journal_uploads` table on **Microservices (Reporting Aggregation)** database (ID: **4**) to find the matching upload.

```sql
SELECT id, status, category, total_entry_count, total_line_count,
       entries_succeeded, entries_failed, created_at, completed_at
FROM ledge.bulk_journal_uploads
ORDER BY id DESC
LIMIT 10;
```

**Important:** Always use the `ledge.` schema prefix. The database ID is **4** (Microservices Reporting Aggregation, PostgreSQL).

Match the upload by comparing:
- `total_entry_count` and `total_line_count` against the CSV
- `created_at` timestamp (should be recent if just uploaded)
- Ask the user to confirm the upload ID if ambiguous

Report the upload **status** to the user:
- `SUCCESS` — all entries processed
- `PENDING` — still processing or stalled
- `FAILED` — upload failed entirely

### Step 3: Extract idempotency keys from Ledge

Query `ledge.bulk_journal_lines` for the confirmed upload ID:

```sql
SELECT id, entry_num, line_number, status, idempotency_key, error_message,
       asset_id, sub_account, natural_account, currency_code,
       tx_type, tx_sub_type, qty_delta, bv_delta, position_type,
       business_unit, description
FROM ledge.bulk_journal_lines
WHERE bulk_upload_id = <UPLOAD_ID>
ORDER BY entry_num, line_number;
```

**Check and report:**
- All lines should have `status = 'SUCCESS'`
- Flag any lines with `error_message` populated
- Extract the distinct `idempotency_key` values — format is typically `bulk-mj-<upload_id>-entry-<N>`
- Cross-compare Ledge line data against CSV (sub_account, asset_id, qty_delta vs ENTERED_DR/CR)

### Step 4: Generate Oracle SQL for GL verification

Using the idempotency keys from Step 3, generate two Oracle queries:

**Query A — Batch-level summary:**

```sql
SELECT
    b.JE_BATCH_ID, b.NAME AS batch_name, b.STATUS AS batch_status, b.POSTED_DATE,
    h.JE_HEADER_ID, h.EXTERNAL_REFERENCE, h.CURRENCY_CODE, h.JE_CATEGORY,
    h.PERIOD_NAME, h.STATUS AS header_status,
    COUNT(l.JE_LINE_NUM) AS line_count,
    SUM(l.ENTERED_DR) AS total_dr,
    SUM(l.ENTERED_CR) AS total_cr
FROM GL.GL_JE_BATCHES b
JOIN GL.GL_JE_HEADERS h ON b.JE_BATCH_ID = h.JE_BATCH_ID
JOIN GL.GL_JE_LINES l   ON h.JE_HEADER_ID = l.JE_HEADER_ID
WHERE h.EXTERNAL_REFERENCE IN (
    <IDEMPOTENCY_KEYS_COMMA_SEPARATED>
)
GROUP BY b.JE_BATCH_ID, b.NAME, b.STATUS, b.POSTED_DATE,
         h.JE_HEADER_ID, h.EXTERNAL_REFERENCE, h.CURRENCY_CODE,
         h.JE_CATEGORY, h.PERIOD_NAME, h.STATUS
ORDER BY h.EXTERNAL_REFERENCE;
```

**Query B — Full line detail with precision amounts (important for dust values):**

```sql
SELECT
    h.EXTERNAL_REFERENCE,
    l.JE_LINE_NUM, l.EFFECTIVE_DATE,
    c.SEGMENT3 AS natural_account, c.SEGMENT4 AS sub_account,
    c.SEGMENT5 AS asset_id, c.SEGMENT6 AS position_type,
    TO_CHAR(l.ENTERED_DR, '99999999999999999999.9999999999999999') AS entered_dr_full,
    TO_CHAR(l.ENTERED_CR, '99999999999999999999.9999999999999999') AS entered_cr_full,
    l.DESCRIPTION,
    h.STATUS AS header_status
FROM GL.GL_JE_HEADERS h
JOIN GL.GL_JE_LINES l          ON h.JE_HEADER_ID = l.JE_HEADER_ID
JOIN GL.GL_CODE_COMBINATIONS c ON l.CODE_COMBINATION_ID = c.CODE_COMBINATION_ID
WHERE h.EXTERNAL_REFERENCE IN (
    <IDEMPOTENCY_KEYS_COMMA_SEPARATED>
)
ORDER BY h.EXTERNAL_REFERENCE, l.JE_LINE_NUM;
```

Replace `<IDEMPOTENCY_KEYS_COMMA_SEPARATED>` with the actual keys in single quotes, e.g.:
`'bulk-mj-7-entry-1', 'bulk-mj-7-entry-2', 'bulk-mj-7-entry-3', 'bulk-mj-7-entry-4'`

### Step 5: Tell the user what to verify

Present a checklist of what to confirm in Oracle results:

1. **All entries exist** — one row per idempotency key in Query A
2. **Posted status** — `batch_status` and `header_status` = `'P'` (posted) or `'U'` (unposted)
3. **Line counts** — 2 lines per entry (1 DR + 1 CR)
4. **DR/CR balance** — total_dr = total_cr per entry (balanced journal)
5. **Sub-accounts match** — `SEGMENT4` values match CSV `SUB_ACCT`
6. **Asset IDs match** — `SEGMENT5` values match CSV `ASSET_ID`
7. **Position type** — `SEGMENT6` matches CSV `POSITION` (e.g. `CP`)
8. **Amounts match exactly** — use Query B full-precision output to compare against CSV DR/CR values
9. **Flag discrepancies** — note any Ledge lines where `qty_delta = 0` but CSV had a non-zero amount

---

## Reference

- **Preset database:** Microservices (Reporting Aggregation), ID = 4, PostgreSQL
- **Schema:** `ledge`
- **Tables:** `ledge.bulk_journal_uploads`, `ledge.bulk_journal_lines`
- **Idempotency key format:** `bulk-mj-<upload_id>-entry-<entry_num>`
- **Oracle join:** `GL_JE_HEADERS.EXTERNAL_REFERENCE` = Ledge `idempotency_key`
- **For Oracle schema details**, load the `oracle-sql` skill
