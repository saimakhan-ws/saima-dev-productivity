---
name: ledge-sql
description: Use when generating Ledge PostgreSQL SQL queries for ad-hoc investigation — journals, approvals, rejections, journal lines, downstream request ID lookups, creator/approver searches, request status, book value changes, asset/account lookups
---

# Ledge PostgreSQL SQL Skill

**Trigger:** Use this skill when generating Ledge Postgres SQL queries for ad-hoc investigation — journals, approvals, rejections, journal lines, accounts, assets, request status, book value changes.

All tables live in the `ledge` schema. Queries are for **ad-hoc investigation** (psql / DB client). Use standard PostgreSQL syntax; use `ILIKE` for case-insensitive matching.

---

## Schema

### Relationships
```
ledge.requests (1) ←── (1) ledge.journals (1) ←── (N) ledge.journal_lines
```

### ledge.requests — request lifecycle
| Column | Notes |
|---|---|
| `id` | PK |
| `creator_id` | Oracle user ID of requester |
| `creator_user_name` | display name of requester |
| `created_at` | creation timestamp |
| `updated_at` | last update timestamp |
| `status` | see status reference below |
| `jira_id` | Jira ticket reference |
| `error_message` | set on FAILED status |
| `downstream_request_id` | idempotency key sent downstream (e.g. `ledge-manual-journal-{timestamp}-{acct_id}`); matches `GL_JE_HEADERS.EXTERNAL_REFERENCE` in Oracle |

### ledge.journals — journal entry header
| Column | Notes |
|---|---|
| `id` | PK |
| `request_id` | FK → ledge.requests |
| `category` | journal category name |
| `approver1_id` | first approver Oracle ID |
| `approver1_name` | first approver display name |
| `approver2_id` | second approver Oracle ID |
| `approver2_name` | second approver display name |
| `rejecter_id` | who rejected (if rejected) |
| `rejection_reason` | reason for rejection |

### ledge.journal_lines — individual accounting entries
| Column | Notes |
|---|---|
| `id` | PK |
| `journal_id` | FK → ledge.journals |
| `effective_timestamp` | when the entry takes effect |
| `position_type` | |
| `asset_id` | asset identifier |
| `listing_id` | listing identifier |
| `currency_code` | |
| `tx_type` | transaction type |
| `tx_sub_type` | transaction subtype |
| `description` | free-text description |
| `reference_type` | |
| `fx_rate` | FX rate applied |
| `business_unit` | e.g. 'TR' |
| `natural_account` | GL natural account code |
| `sub_account` | client account ID (e.g. 'W100585K2CAD') |
| `record_type` | |
| `qty_delta` | quantity change (positive = increase) |
| `bv_delta` | book value change |
| `commission` | |
| `tx_group_id` | transaction group ID |
| `external_source` | originating system |
| `related_asset_id` | for transfers/related entries |

### Request Status Reference
| Status | Description |
|---|---|
| `PENDING_APPROVAL_1` | Awaiting first approval |
| `PENDING_APPROVAL_2` | Awaiting second approval |
| `REJECTED` | Rejected by an approver |
| `PROCESSING` | Being processed by downstream systems |
| `COMPLETE` | Successfully completed |
| `FAILED` | Failed during processing |

---

## Query Templates

### Full journal detail by journal ID
```sql
SELECT
  r.id AS request_id, r.jira_id, r.status, r.error_message,
  r.creator_id, r.creator_user_name,
  r.created_at AS request_created_at, r.updated_at AS request_updated_at,
  j.id AS journal_id, j.category,
  j.approver1_name, j.approver2_name, j.rejection_reason,
  jl.id AS line_id, jl.effective_timestamp, jl.position_type,
  jl.asset_id, jl.listing_id, jl.currency_code,
  jl.tx_type, jl.tx_sub_type, jl.description, jl.reference_type,
  jl.fx_rate, jl.business_unit, jl.natural_account, jl.sub_account,
  jl.record_type, jl.qty_delta, jl.bv_delta, jl.commission,
  jl.tx_group_id, jl.external_source, jl.related_asset_id
FROM ledge.journals j
JOIN ledge.requests r ON j.request_id = r.id
LEFT JOIN ledge.journal_lines jl ON jl.journal_id = j.id
WHERE j.id = :journal_id
ORDER BY jl.id;
```

### Find by creator name / ID
```sql
-- By name (fuzzy)
SELECT j.id AS journal_id, r.id AS request_id,
  r.creator_user_name, r.created_at, r.status, j.category
FROM ledge.journals j
JOIN ledge.requests r ON j.request_id = r.id
WHERE r.creator_user_name ILIKE '%:name%'
ORDER BY r.created_at DESC;

-- By Oracle ID (exact)
SELECT j.id AS journal_id, r.creator_user_name, r.created_at, r.status
FROM ledge.journals j
JOIN ledge.requests r ON j.request_id = r.id
WHERE r.creator_id = ':oracle_id'
ORDER BY r.created_at DESC;
```

### Find by approver
```sql
SELECT j.id AS journal_id, j.approver1_name, j.approver2_name,
  r.creator_user_name AS requester, r.status, r.created_at
FROM ledge.journals j
JOIN ledge.requests r ON j.request_id = r.id
WHERE j.approver1_name ILIKE '%:name%'
   OR j.approver2_name ILIKE '%:name%'
ORDER BY r.created_at DESC;
```

### Pending approval
```sql
SELECT j.id AS journal_id, r.status,
  j.approver1_name, j.approver2_name,
  r.creator_user_name, r.created_at
FROM ledge.journals j
JOIN ledge.requests r ON j.request_id = r.id
WHERE r.status IN ('PENDING_APPROVAL_1', 'PENDING_APPROVAL_2')
ORDER BY r.created_at ASC;
```

### Find by date range
```sql
SELECT j.id AS journal_id, r.creator_user_name, r.created_at, r.status, j.category
FROM ledge.journals j
JOIN ledge.requests r ON j.request_id = r.id
WHERE r.created_at >= ':start_date'
  AND r.created_at <  ':end_date'
ORDER BY r.created_at DESC;
```

### Find by asset
```sql
SELECT DISTINCT j.id AS journal_id, jl.asset_id,
  jl.description, jl.qty_delta, jl.bv_delta,
  r.creator_user_name, r.created_at
FROM ledge.journals j
JOIN ledge.requests r ON j.request_id = r.id
JOIN ledge.journal_lines jl ON jl.journal_id = j.id
WHERE jl.asset_id = ':asset_id'
ORDER BY r.created_at DESC;
```

### Find by natural account + sub-account
```sql
SELECT DISTINCT j.id AS journal_id,
  jl.natural_account, jl.sub_account, jl.business_unit,
  jl.qty_delta, jl.bv_delta, r.creator_user_name, r.status
FROM ledge.journals j
JOIN ledge.requests r ON j.request_id = r.id
JOIN ledge.journal_lines jl ON jl.journal_id = j.id
WHERE jl.natural_account = ':natural_account'
  AND jl.sub_account = ':sub_account'
ORDER BY r.created_at DESC;
```

### Find by description keyword
```sql
SELECT DISTINCT j.id AS journal_id,
  jl.description, jl.qty_delta, jl.bv_delta,
  r.creator_user_name, r.created_at
FROM ledge.journals j
JOIN ledge.requests r ON j.request_id = r.id
JOIN ledge.journal_lines jl ON jl.journal_id = j.id
WHERE jl.description ILIKE '%:keyword%'
ORDER BY r.created_at DESC;
```

### Find by downstream request ID (idempotency key)
```sql
SELECT r.*, j.id AS journal_id, j.category,
  j.approver1_name, j.approver2_name, j.rejecter_id, j.rejection_reason
FROM ledge.requests r
JOIN ledge.journals j ON j.request_id = r.id
WHERE r.downstream_request_id = 'ledge-manual-journal-1771464311865-BR00159D0CAD';
```

### Find by status
```sql
SELECT j.id AS journal_id, r.status, r.error_message,
  r.creator_user_name, r.created_at, r.updated_at
FROM ledge.journals j
JOIN ledge.requests r ON j.request_id = r.id
WHERE r.status = ':status'
ORDER BY r.created_at DESC;
```

### Find rejected journals
```sql
SELECT j.id AS journal_id, j.rejection_reason, j.rejecter_id,
  r.creator_user_name AS requester, r.created_at, r.updated_at AS rejected_at
FROM ledge.journals j
JOIN ledge.requests r ON j.request_id = r.id
WHERE r.status = 'REJECTED'
ORDER BY r.updated_at DESC;
```

### Combined multi-filter search (uncomment filters as needed)
```sql
SELECT DISTINCT j.id AS journal_id, r.status,
  r.creator_user_name, j.approver1_name, j.approver2_name,
  j.category, r.created_at,
  (SELECT COUNT(*) FROM ledge.journal_lines WHERE journal_id = j.id) AS line_count
FROM ledge.journals j
JOIN ledge.requests r ON j.request_id = r.id
LEFT JOIN ledge.journal_lines jl ON jl.journal_id = j.id
WHERE 1=1
  -- AND r.creator_user_name ILIKE '%name%'
  -- AND r.created_at >= '2025-01-01'
  -- AND r.created_at <  '2025-02-01'
  -- AND r.status = 'COMPLETE'
  -- AND j.category = 'CATEGORY_NAME'
  -- AND (j.approver1_name ILIKE '%approver%' OR j.approver2_name ILIKE '%approver%')
  -- AND jl.asset_id = 'specific-asset-id'
  -- AND jl.natural_account = '12345'
  -- AND jl.sub_account = 'W100585K2CAD'
  -- AND jl.description ILIKE '%keyword%'
  -- AND ABS(jl.bv_delta) > 1000
  -- AND r.jira_id = 'LO-1234'
ORDER BY r.created_at DESC
LIMIT 100;
```

---

## Aggregation Templates

### Count by status
```sql
SELECT r.status, COUNT(*) AS count
FROM ledge.journals j
JOIN ledge.requests r ON j.request_id = r.id
GROUP BY r.status
ORDER BY count DESC;
```

### Top requesters (last 30 days)
```sql
SELECT r.creator_user_name, COUNT(*) AS journal_count
FROM ledge.journals j
JOIN ledge.requests r ON j.request_id = r.id
WHERE r.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY r.creator_user_name
ORDER BY journal_count DESC
LIMIT 20;
```

### BV delta by business unit
```sql
SELECT jl.business_unit,
  SUM(jl.bv_delta) AS total_bv_delta,
  COUNT(DISTINCT j.id) AS journal_count
FROM ledge.journals j
JOIN ledge.requests r ON j.request_id = r.id
JOIN ledge.journal_lines jl ON jl.journal_id = j.id
WHERE r.status = 'COMPLETE'
  AND r.created_at >= '2025-01-01'
GROUP BY jl.business_unit
ORDER BY total_bv_delta DESC;
```

---

## Tips
- **Use `ILIKE`** for case-insensitive name/description searches
- **Always join through `requests`** — it holds creator info, timestamps, and status
- **Use `DISTINCT`** when joining `journal_lines` to avoid duplicate journal rows
- **Check both approver columns** — `approver1_name` and `approver2_name`
- **Fastest lookup** — use `r.jira_id` if you have the Jira ticket reference
- **Large bv_delta** — use `ABS(jl.bv_delta) > threshold` to find significant entries
