# BOR Write On-Call Quick Reference Runbook

> Source: [On-Call Handbook: HOW-TO](https://www.notion.so/5e19786b1c4c4538927de20faf9e32ad)
> Last generated: 2026-02-13

---

## Table of Contents

- [Trigger a GitHub Build](#trigger-a-github-build)
- [Produce a Message on GL Publisher in Staging](#produce-a-message-on-gl-publisher-in-staging)
- [Verify GL Publisher API in Staging](#verify-gl-publisher-api-in-staging)
- [Verify Stuck GL Publisher Imports](#verify-stuck-gl-publisher-imports)
- [Re-Import Groups](#re-import-groups)
- [Taking GL Publisher Down for Maintenance](#taking-gl-publisher-down-for-maintenance)
- [Taking Ledge Down for Maintenance](#taking-ledge-down-for-maintenance)
- [Stop GL Publisher Containers](#stop-gl-publisher-containers)
- [Reset Kafka Consumer Offset](#reset-kafka-consumer-offset)
- [Verify Unique Lines in GL Records](#verify-unique-lines-in-gl-records)
- [Exclude Group IDs from Preset Dashboard](#exclude-group-ids-from-failed-and-stuck-gl_interface-records-preset-dashboard)
- [Deal With Slow GL Imports](#deal-with-slow-gl-imports)
- [Find Idempotency Key Given Account ID](#find-idempotency-key-given-account-id)
- [Find Account ID Given Idempotency Key](#find-account-id-given-idempotency-key)
- [Reverse Transactions in Oracle Prod](#reverse-transactions-in-oracle-prod)
- [Find Failed Records](#find-failed-records)
- [Query Ingress Stream with ksqlDB](#query-ingress-stream-with-ksqldb)
- [Connect to Prod Postgres](#connect-to-prod-postgres)
- [Deploy to Staging](#deploy-to-staging)
- [Manually Post Transactions to GL_INTERFACE](#manually-post-transactions-to-gl_interface)
- [Investigate Duplicate GL Interface Records](#investigate-duplicate-gl-interface-records)
- [Fix Incorrect Status Between Postgres and Oracle](#fix-incorrect-status-of-activities-between-postgres-and-oracle)
- [Add a Value to a Flexfield](#add-a-value-to-a-flexfield)
- [Find Flexfield Value Information](#find-information-about-flexfield-values)
- [Handle Container Out of Memory Error](#handle-a-container-out-of-memory-error)
- [Update Business Unit of an AP Account](#update-the-business-unit-of-an-ap-account)
- [Update Book Values](#update-book-values)
- [Update Natural Account for Inventory Account](#update-natural-account-for-inventory-account)
- [Update Data in Oracle](#update-data-in-oracle)
- [Find GL Publisher Idempotency for a ledger_entry in IRS](#find-gl-publisher-idempotency-for-a-ledger_entry-in-irs)
- [Debug Cheque Files Processor Tool Postings](#debug-cheque-files-processor-tool-postings)
- [Redeploy GL Publisher](#redeploy-gl-publisher)
- [Find Ledger Lines for Aggregated Activities](#find-ledger-lines-for-aggregated-activities)
- [Resend Audit Events for Completed GlWriterActivityImport](#resend-audit-events-for-completed-glwriteractivityimport)
- [Unknown Merchant Transaction](#unknown-merchant-transaction---debitcredit)
- [Client Asking to Confirm Amounts Seen In-App](#client-asking-to-confirm-amounts-seen-in-app)
- [Investigating and Resolving Missing CP Lines](#investigating-and-resolving-missing-cp-lines)
- [Correct Wrong Book Value After Stock Split](#correct-wrong-book-value-after-stock-split)
- [Diagnose Transfer-In BV_DR/BV_CR Swap (LO-2610)](#diagnose-transfer-in-bv_drbv_cr-swap)

---

## Trigger a GitHub Build

**Why:** Combined PRs (from dependabot) don't automatically build.

- **Option 1:** Push an empty commit
  ```shell
  git commit --allow-empty -m "Trigger Build"
  ```
- **Option 2:** Rebase the combined PR against `master` / `main`

---

## Produce a Message on GL Publisher in Staging

1. Clone `oracle-gl-publisher` repo
2. Copy `.env.template`
3. Comment the Kafka development section
4. Uncomment the Kafka staging section
5. In [ScenarioRunner](https://github.com/wealthsimple/oracle-gl-publisher/blob/b3c3a18dd37cdaef1dfdb385f57fa95d813d68a0/queue-processor/src/main/kotlin/com/wealthsimple/oracleglpublisher/queueprocessor/oncall/ScenarioRunner.kt), run a specific test case (easiest: `testWriteOff`). Run KafkaProducer with env file.
6. Check staging logs for burst of messages in non-api gl publisher logs.

> It's OK if messages fail processing (invalid) -- as long as GL Publisher contacted and processed them.

---

## Verify GL Publisher API in Staging

1. Go to **Atlas staging**
2. Go to **GL Publisher DLQ tool**
3. If you can see failed messages, the API is up. If not, the API is down.

---

## Verify Stuck GL Publisher Imports

### Step 1: Find stuck imports

- **Option 1:** [Stuck imports Preset dashboard](https://8a26d867.wealthsimple-aws-mpc.app.preset.io/explore/?dashboard_page_id=Ae2iC4h02A&slice_id=28874)
- **Option 2:** Run queries:

```sql
-- Oracle (pws1e)
SELECT * FROM gl.GL_INTERFACE
WHERE status = 'NEW'
  AND DATE_CREATED < (SYSDATE - interval '12' hour)
  AND CREATED_BY = 5468
ORDER BY DATE_CREATED;

-- Preset
SELECT *
FROM ledger_interface_gl_views.gl_interface
WHERE status = 'NEW'
  AND date_created::date < sysdate::date
  AND CREATED_BY = 5468
ORDER BY DATE_CREATED DESC;
```

> Tip: Check date format if needed: `SELECT * FROM nls_session_parameters WHERE parameter = 'NLS_DATE_FORMAT';`

### Step 2: Verify no pending import requests

```sql
-- Oracle
SELECT *
FROM gl.GL_INTERFACE_CONTROL ic
INNER JOIN gl.gl_interface i
  ON ic.group_id = i.group_id
LEFT JOIN APPLSYS.fnd_concurrent_requests fcr
  ON to_char(ic.interface_run_id) = to_char(fcr.argument1)
WHERE fcr.requested_by IS NULL
  AND i.DATE_CREATED < (SYSDATE - interval '12' hour)
  AND i.CREATED_BY = 5468;
```

### Step 3: Decision

- **No pending import requests** --> [Re-import the groups](#re-import-groups)
- **Yes pending import requests** --> Contact [#oracle-support](https://wealthsimple.enterprise.slack.com/archives/C9X5JUH0V)

---

## Re-Import Groups

### Determine if Something Can Be Reimported

1. Ask Sheri, **OR**
2. Track down owning team via [Inventory of Oracle Transaction Sources](https://www.notion.so/10b9e553499a4d599d745e3596f24e7c)
3. Ask that team if the transaction was already reposted
4. Check if source account would go delinquent:
   - Run: `SELECT * FROM gl.gl_interface WHERE group_id = <id>;`
   - A single transaction has 2 rows. Find SEGMENT4 (account ID) of the source account (the row with non-zero ENTERED_CR)
   - Look up account ID in Atlas Prod
   - **Safe to reimport if:**
     - (a) Account has plenty of balance, **OR**
     - (b) Account already has a hold for the stuck transaction (check Inflight Activities for matching idempotency key)

### How to Re-Import

#### Preferred: Ledge Form
Go to [ledge.wealthsimple.com/journal-import](https://ledge.wealthsimple.com/journal-import)

#### Alternative: Python Script (Option A -- heavily preferred)

1. Open an **EOC** (manual transaction) or **[FLAMB](https://wealthsimple.atlassian.net/jira/software/projects/FLAMB/boards/849)** (service-generated) ticket for audit trail
2. If >4K groups, split into multiple sheets using:
   ```javascript
   function splitRowsWithNoHeader() {
     var ss = SpreadsheetApp.getActiveSpreadsheet();
     var sheet = ss.getActiveSheet();
     var range = sheet.getDataRange();
     var values = range.getValues();
     var maxRowsPerSheet = 4000;
     var sheetCount = 1;
     for (var i = 0; i < values.length; i += maxRowsPerSheet) {
       var newSheet = ss.insertSheet('Sheet' + sheetCount);
       var chunk = values.slice(i, i + maxRowsPerSheet);
       newSheet.getRange(1, 1, chunk.length, chunk[0].length).setValues(chunk);
       sheetCount++;
     }
   }
   ```
3. Use [this python script](https://github.com/wealthsimple/scratchpad/blob/master/bor/oracle-GL_INTERFACE/oracleBridgeRequest/reimport-gl-batch.py)
   ```shell
   uv run --with requests python reimport-gl-batch.py -f {file.csv} -e production
   ```
4. Get USER_JE_SOURCE_NAME(s) and GROUP_ID(s):
   ```sql
   -- Oracle example for April 9, 2024
   SELECT DISTINCT
     gli.GROUP_ID GroupID,
     gli.USER_JE_SOURCE_NAME
   FROM gl.gl_interface gli
   INNER JOIN apps.FND_USER usr ON usr.user_id = gli.created_by
   WHERE STATUS = 'NEW'
     AND to_date(DATE_CREATED,'YY-MM-DD') = '24-04-09';
   ```
5. **Verify it worked:**
   - Response status should be **204**
   - Check [Datadog logs](https://app.datadoghq.com/logs?query=service%3Aso-oracle-bridge%20%22import_group%22%20)
   - Confirm GL_INTERFACE no longer has the stuck group_id

#### Option B (emergency only -- script needs updates, double check with team)

1. [Generate request body](https://github.com/wealthsimple/scratchpad/blob/master/bor/oracle-GL_INTERFACE/oracleBridgeRequest/generateRequestBody.py) with group IDs
2. Follow [these instructions](https://github.com/wealthsimple/scratchpad/blob/master/bor/oracle-GL_INTERFACE/oracleBridgeRequest/sampleRequest.curl) to call oracle-bridge in Prod

> Credentials: Look for "Oracle Bridge" in 1Password.

---

## Taking GL Publisher Down for Maintenance

1. Mute monitors:
   - [BOR Write GL Publisher monitors](https://app.datadoghq.com/monitors/manage?q=oracle-gl-publisher%20-%22STAGING%22%20team%3Abor-write)
   - [BOR Write GL Publisher monitors (alt)](https://app.datadoghq.com/monitors/manage?q=oracle-gl-publisher%20-%22STAGING%22%20team%3A%40BOR-Write)
2. [Stop GL Publisher container](#stop-gl-publisher-containers)
3. Wait until downtime is finished
4. Start GL Publisher back up (same action as step 2)
5. Monitor the system and wait for monitors to clear
6. Unmute the monitors

> Note: Producers can still send messages to the GL Publisher ingress Kafka topic while it's down.

---

## Taking Ledge Down for Maintenance

1. Mute monitors: [Ledge monitors](https://app.datadoghq.com/monitors/manage?q=ledge%20-%22STAGING%22%20team%3Abor-write)
2. [Stop Ledge container](https://github.com/wealthsimple/ledge/actions/workflows/manage_containers.yml)
3. Wait until downtime is finished
4. Start Ledge back up (same action as step 2)
5. Monitor the system and wait for monitors to clear
6. Unmute the monitors

---

## Stop GL Publisher Containers

GL Publisher runs on K8s. Use the GitHub workflow:

- [Manage Containers workflow](https://github.com/wealthsimple/oracle-gl-publisher/actions/workflows/manage_containers.yml)
- Enter environment (`staging` or `prod`) and action (`enable` or `disable`)
- This immediately stops/starts the container

---

## Reset Kafka Consumer Offset

**LAST RESORT ONLY.** Our team does NOT have production permissions -- page **#streaming-platform-oncall** (dev tools).

### Staging Only

1. **Stop GL Publisher first** (otherwise you get: `Error: Assignments can only be reset if the group 'gl-publisher-ingress' is inactive`)
2. Run:
   ```shell
   kafka-consumer-groups --bootstrap-server pkc-4v2jl.ca-central-1.aws.confluent.cloud:9092 \
   --group gl-publisher-ingress --topic gl-publisher-tx-ingress-stream:2 --reset-offsets --to-offset 7743601 \
   --command-config config.properties --execute

   # Username/password from your .env:
   # KAFKA_SASL_JAAS_KEY
   # KAFKA_SASL_JAAS_SECRET
   ```
3. Create API Key on [Confluent Cloud (Global Access)](https://confluent.cloud/environments/env-dg09d/clusters/lkc-0y00q/api-keys) if needed

---

## Verify Unique Lines in GL Records

**Symptom:** Poison pill error: `[attempt 361] Ingress activity processing failed with retryable error: A different object with the same identifier value was already associated with the session`

Use [this Preset query](https://8a26d867.wealthsimple-aws-mpc.app.preset.io/sqllab?savedQueryId=4049) to identify which activity and lines (transaction type) are being duplicated.

---

## Exclude Group IDs from Failed and Stuck GL_INTERFACE Records Preset Dashboard

> **Preferred approach:** Have the groups deleted from GL_INTERFACE instead. Sample request: [DSTORSDB-880](https://wealthsimple.atlassian.net/browse/DSTORSDB-880)

1. On any chart on the [dashboard](https://8a26d867.wealthsimple-aws-mpc.app.preset.io/superset/dashboard/2116/), click "..." --> "Edit chart"
2. In Chart Source column, click "..." next to dataset --> "Edit dataset"
3. Click the lock icon to allow changes, edit the SQL WHERE to add new excluded group IDs
4. Save dataset changes (applies to all charts automatically)
5. **Also update the alert:**
   - Go to [Preset alerts](https://8a26d867.wealthsimple-aws-mpc.app.preset.io/alert/list/?filters=(name:'%5BGL%20Publisher%5D%20-%20Unposted%20GL%20Interface%20Records'))
   - Actions --> Edit (pencil icon)
   - Add new group IDs to the WHERE clause

---

## Deal With Slow GL Imports

**Monitor:** [Datadog monitor #123025527](https://app.datadoghq.com/monitors/123025527)

### Cause 1: Oracle is Being Slow

1. Check [pending GL Import requests graph](https://app.datadoghq.com/dashboard/bkq-7rr-msd/bor-oracle-gl-publisher?fullscreen_widget=5087981768739830)
   - GL Publisher throttles after queue reaches **3,000** in Oracle
2. Check [Oracle status dashboard](https://app.datadoghq.com/dashboard/2ct-x2w-ckj/oracle-status)
3. **If queue at 3,000+ for several hours and not trending down** --> Oracle issue
4. Post in [#oracle-support](https://wealthsimple.enterprise.slack.com/archives/C9X5JUH0V), tag **@oracle-experts**
   - After hours: click "Oracle DBA On-Call" button in the Slack channel to page someone

### Cause 2: Records Stuck in STARTED State in GL_INTERFACE

```sql
-- Find slow activities (Preset: use ledger_xxbrk_views.gl_writer_activity_import)
SELECT * FROM apps.gl_writer_activity_import
WHERE STATUS = 'STARTED'
ORDER BY CREATED_AT ASC;

-- Find groups needing reimport (where concurrent request errored)
SELECT GROUP_ID, USER_JE_SOURCE_NAME, COUNT(*)
FROM Gl.GL_INTERFACE
WHERE GROUP_ID IN (
   SELECT GW.GROUP_ID
     FROM APPS.GL_WRITER_ACTIVITY_IMPORT GW
     INNER JOIN APPS.FND_CONCURRENT_REQUESTS R ON GW.REQUEST_ID = R.REQUEST_ID
     WHERE GW.STATUS = 'STARTED'
      AND R.STATUS_CODE = 'E'
  )
GROUP BY GROUP_ID, USER_JE_SOURCE_NAME;
```

- If concurrent request status_code is `E` --> [Re-Import the groups](#re-import-groups)

Additional diagnostic queries:
```sql
SELECT GROUP_ID, COUNT(DISTINCT IDEMPOTENCY_KEY), MIN(CREATED_AT), MAX(CREATED_AT)
FROM apps.gl_writer_activity_import
WHERE status = 'STARTED'
GROUP BY GROUP_ID;

SELECT idempotency_key, group_id
FROM apps.gl_writer_activity_import
WHERE group_id IN ('152052783');
```

---

## Find Idempotency Key Given Account ID

```sql
SELECT
  h.external_reference AS idempotency_key,
  c.segment4 AS account_id,
  l.attribute3 AS transaction_type,
  l.ENTERED_DR, l.ENTERED_CR,
  l.DESCRIPTION
FROM apps.GL_JE_HEADERS h
  JOIN apps.gl_je_lines l ON h.je_header_id = l.je_header_id
  JOIN apps.gl_code_combinations c ON l.code_combination_id = c.code_combination_id
WHERE c.SEGMENT4 = '<account id>'
-- add more clauses for date, amount, etc.
;
```

> Tip: Ask the ticket requester for date, transaction type, and amount to narrow results.

---

## Find Account ID Given Idempotency Key

```sql
-- Preset (Postgres)
SELECT idempotency_key || ',' || accountId FROM (
  SELECT json_activity->'ClientActivity'->'accountId'->>'accountId' AS accountId, idempotency_key
  FROM gl_publisher.activities
  WHERE idempotency_key IN ('<key>')
);

-- Preset (Redshift/Pantheon)
SELECT * FROM gl_publisher.activities
WHERE idempotency_key = '<key>';

-- Oracle
SELECT
  h.external_reference,
  c.segment4 AS account_id,
  l.attribute3,
  l.ENTERED_DR, l.ENTERED_CR,
  l.DESCRIPTION
FROM gl.GL_JE_HEADERS h
  JOIN gl.gl_je_lines l ON h.je_header_id = l.je_header_id
  JOIN gl.gl_code_combinations c ON l.code_combination_id = c.code_combination_id
WHERE h.EXTERNAL_REFERENCE = '<idempotency key>';
```

---

## Reverse Transactions in Oracle Prod

### Pre-Checks (MANDATORY)

- Do NOT reverse without **approval & a FLAMB ticket** (under the Epic for Reversals)
- Do NOT reverse without confirming transactions **actually exist in ledger**
- Do NOT reverse without verifying the client account has **sufficient assets/funds**
  - **Cash:** Atlas --> Overview --> Portfolio Details --> check Current Cash Balance, Available to Withdraw
  - **Invest account (cash transfer in):** If cash was used to buy securities, note in ticket so someone can cancel buys

**3 Ground Rules for Reversals:**
1. The error was made by WS (Ops/CS) after clear instruction from the client (exceptions for GEN clients, large values, system issues)
2. Funds are still in the destination account
3. Client is aware of tax/contribution updates needed with CRA

### Query to Get Reversal Information

```sql
SELECT
    b.POSTING_RUN_ID,
    u.USER_NAME AS created_by,
    l.EFFECTIVE_DATE,
    l.ATTRIBUTE3,
    l.ENTERED_DR,
    l.ENTERED_CR,
    h.CURRENCY_CODE,
    s.STARDATA_SYMBOL,
    l.DESCRIPTION,
    c.SEGMENT4,
    h.EXTERNAL_REFERENCE || ',' || c.SEGMENT4 AS reversal_input,
    h.NAME
FROM gl.GL_JE_LINES l
    JOIN gl.gl_je_headers h ON l.je_header_id = h.je_header_id
    JOIN gl.GL_CODE_COMBINATIONS c ON l.CODE_COMBINATION_ID = c.CODE_COMBINATION_ID
    JOIN gl.GL_JE_BATCHES b ON h.JE_BATCH_ID = b.JE_BATCH_ID
    JOIN XXBRK.XXBRK_SEC_MASTER s ON s.ASSET_ID = c.SEGMENT5
    JOIN APPLSYS.fnd_user u ON l.CREATED_BY = u.USER_ID
WHERE h.EXTERNAL_REFERENCE = :idempotencyKey;
```

### Performing the Reversal

1. Go to [ledge.wealthsimple.com/reversal](https://ledge.wealthsimple.com/reversal)
   - Can't access Ledge? See the Ledge access page.
2. **Preferred: GL Publisher Idempotency Key** -- enter `<idempotency key>,<account ID>` and run
   - **Internal transfers (VIA_INVENTORY):** Must NOT reverse by batch_id. Use idempotency key. Use the **original source account ID** (the "from" account in gl_je_lines.description)
   - Only possible if the activity was originally posted by GL Publisher (created_by = **5468**)
   - **Aggregated batches:** Reversal by idempotency key will NOT work with GL Publisher's new aggregation method. Batch ID reversal is also undesirable. Message **#bor-write-oncall** for help.
3. Check [Datadog](https://app.datadoghq.com/logs?query=reverse-) to ensure the request arrived at GL Publisher
4. Optional: check [Preset](https://8a26d867.wealthsimple-aws-mpc.app.preset.io/superset/dashboard/3535/) to ensure Oracle processed the request
5. Verify with [this dashboard](https://8a26d867.wealthsimple-aws-mpc.app.preset.io/superset/dashboard/3535/)

### Post-Reversal: Notify Upstream Teams

- **Tooth Fairy** (idempotency key like `user_bonus_%`): See the process doc for sending to other teams
- **Fort Knox** (idempotency key like `funding_intent%`): See the process doc

---

## Find Failed Records

### Created by GL Publisher (created_by = 5468)

[Preset Dashboard](https://8a26d867.wealthsimple-aws-mpc.app.preset.io/explore/?dashboard_page_id=Ae2iC4h02A&slice_id=28856)

```sql
-- Oracle
SELECT * FROM gl.GL_INTERFACE
WHERE status != 'NEW'
  AND CREATED_BY = 5468
ORDER BY DATE_CREATED DESC;

-- Preset
SELECT * FROM ledger_interface_gl_views.gl_interface
WHERE status != 'NEW'
  AND CREATED_BY = 5468
ORDER BY DATE_CREATED DESC;
```

### Created by Other Sources

[Preset Dashboard](https://8a26d867.wealthsimple-aws-mpc.app.preset.io/explore/?dashboard_page_id=Ae2iC4h02A&slice_id=28883)

```sql
-- Oracle
SELECT * FROM gl.GL_INTERFACE
WHERE status != 'NEW'
  AND CREATED_BY != 5468
ORDER BY DATE_CREATED DESC;

-- Preset
SELECT * FROM ledger_interface_gl_views.gl_interface
WHERE status = 'NEW'
  AND date_created::date < (sysdate - interval '7 days')::date
  AND CREATED_BY != 5468
ORDER BY DATE_CREATED DESC;
```

---

## Query Ingress Stream with ksqlDB

- [How to query ingress stream](https://docs.google.com/document/d/1wo_N3FLyn9GB6PEbLpyjET3zIKQy5k957ncv2r_qYOk/edit)
- [Additional guide](https://docs.google.com/document/d/1AqYeVoWGnwGW4TpxY6X6qTLneJegLASqR2EuJElzXv8/edit)

---

## Connect to Prod Postgres

[Guide](https://docs.google.com/document/d/1MlAwCsrtfp9dP7o3DYnHEeDPdKpnRLAogyWshlKREaA/edit#heading=h.qe7j7dtiu59p)

---

## Deploy to Staging

[Deployment guide](https://docs.google.com/document/d/1P9f4j1o7dBbPzatReEvPp4Bp0k_FWkffr_3We0SvuDI/edit#) (uses GL Publisher as example, same process for other apps)

---

## Manually Post Transactions to GL_INTERFACE

[How to post transactions manually](https://docs.google.com/document/d/1xqiV_XTgr38fc3G-u3M1JzT_Z8_uCI-TmTIJf8nQtJU/edit)

---

## Investigate Duplicate GL Interface Records

**Monitor:** [Datadog #141741798](https://app.datadoghq.com/monitors/141741798)

**Cause:** Activity generates GLRecords that produce a non-unique GlInterfaceRecordId (combination of multiple GL Interface columns).

### Find Culprit Records

```sql
SELECT
  business_unit, natural_account, sub_account, asset_id,
  position_type, effective_date, currency_code, process_date,
  settlement_date, tx_type, qty_delta, external_reference,
  description,
  COUNT(*)
FROM glpublisher.activities
INNER JOIN glpublisher.gl_records ON activities.id = gl_records.activity_id
WHERE activities.idempotency_key = '<idempotency_key_from_logs>'
  AND deleted_at IS NULL
GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12,13;
```

- One row will have count > 1, indicating duplicate records. Investigate why.
- Generally a PR will be needed to fix ([example PR](https://github.com/wealthsimple/oracle-gl-publisher/pull/2068))

---

## Fix Incorrect Status of Activities Between Postgres and Oracle

**Dashboard:** [Preset status mismatch dashboard](https://8a26d867.wealthsimple-aws-mpc.app.preset.io/superset/dashboard/34262341-072d-4f45-8e6b-30c68fcfc521/)

### Known Cause: Reversal Race Conditions

1. Get list of reversal idempotency keys from the dashboard
2. Run verification query on Preset:

```sql
WITH activities AS (
  SELECT idempotency_key,
    JSON_EXTRACT_PATH_TEXT(json_activity, 'ClientActivity', 'payload', 'target', 'idempotencyKey') targetIdempotencyKey,
    JSON_EXTRACT_PATH_TEXT(json_activity, 'ClientActivity', 'payload', 'target', 'jeBatchId') batchId
  FROM gl_publisher.activities
  WHERE idempotency_key IN ('<reversal_keys_here>')
),
batches_reversed AS (
  SELECT DISTINCT activities.batchId,
    reversal.je_batch_id AS reversal_batch_id
  FROM ledger_gl_views.gl_je_headers reversee
  INNER JOIN activities ON reversee.je_batch_id = activities.batchId
  INNER JOIN ledger_gl_views.gl_je_headers reversal ON reversal.je_header_id = reversee.accrual_rev_je_header_id
  WHERE activities.batchId IS NOT NULL
),
idempotency_keys_reversed AS (
  SELECT DISTINCT activities.targetIdempotencyKey,
    gl_je_headers.je_batch_id AS reversal_batch_id
  FROM ledger_gl_views.gl_je_headers
  INNER JOIN activities ON gl_je_headers.external_reference = activities.targetIdempotencyKey
  WHERE activities.targetIdempotencyKey IS NOT NULL
    AND (description LIKE 'Reverses%')
)
SELECT activities.idempotency_key,
  NVL(idempotency_keys_reversed.reversal_batch_id, batches_reversed.reversal_batch_id) reversal_batch_id
FROM activities
LEFT OUTER JOIN batches_reversed ON activities.batchId = batches_reversed.batchId
LEFT OUTER JOIN idempotency_keys_reversed ON activities.targetIdempotencyKey = idempotency_keys_reversed.targetIdempotencyKey;
```

3. If every `reversal_batch_id` is NOT NULL --> reversal was completed
4. Open a PR to update statuses in Postgres ([example PR](https://github.com/wealthsimple/oracle-gl-publisher/pull/2136))

---

## Add a Value to a Flexfield

**Error:** `Value DIVIDEND for the flexfield segment Reference Type does not exist in the value set BRK_REFERENC`

1. Get Oracle Forms access via [ledge wiki](https://github.com/wealthsimple/ledge/wiki/Oracle-Forms)
2. Navigate: General Ledger --> Setup --> Financials --> Flexfields --> Key --> Values
3. Choose Value Set, type `BRK_REFERENCE_TYPE`, click Find
4. Click the green plus sign (top left) to create a new value
5. Enter details and save (yellow floppy disk icon, 4th from top left)

---

## Find Information About Flexfield Values

```sql
-- Get Code Combination Segment Texts
SELECT s.APPLICATION_COLUMN_NAME, s.SEGMENT_NAME, SV.FLEX_VALUE AS SEGMENT_VALUE, SVT.DESCRIPTION
FROM applsys.fnd_id_flex_segments s
INNER JOIN applsys.fnd_flex_values sv ON s.flex_Value_Set_Id = sv.flex_Value_Set_Id
INNER JOIN APPLSYS.fnd_flex_values_tl svt ON sv.flex_value_id = svt.flex_value_id
WHERE s.application_id = 101
  AND s.id_flex_num = 101
  AND s.id_flex_code = 'GLLE'
  AND svt.LANGUAGE = 'US';

-- Get Attribute Lookups
SELECT APPLICATION_COLUMN_NAME, END_USER_COLUMN_NAME, FLEX_VALUE, svt.DESCRIPTION
FROM apps.fnd_descr_flex_column_usages ffc
JOIN applsys.fnd_flex_values ffcv ON ffcv.flex_Value_Set_Id = ffc.flex_Value_Set_Id
JOIN APPLSYS.fnd_flex_values_tl svt ON ffcv.flex_value_id = svt.flex_value_id
WHERE ffc.application_id = 101
  AND ffc.descriptive_flexfield_name = 'GL_JE_LINES'
  AND ffcv.enabled_Flag = 'Y';
```

> 101 = Oracle General Ledger Application. Flex field tables are used for validation during GL Import.

---

## Handle a Container Out of Memory Error

**Monitors:**
- [queue-processor OOM](https://github.com/wealthsimple/terraform-observability/blob/main/wealthsimple/monitors/oracle-gl-publisher/container.tf#L53-L65)
- [api OOM](https://github.com/wealthsimple/terraform-observability/blob/main/wealthsimple/monitors/oracle-gl-publisher/api-container.tf#L60)

### Steps

1. View OOM events: [Datadog events](https://app.datadoghq.com/event/explorer?query=OOM%20env%3Aproduction%20nomad_group%3Aoracle-gl-publisher%2A%20)
2. Get the `container_id` from the event
3. Filter GL Publisher logs by `@nomad_container:<container_id>` to find the last action before OOM
4. If needed, scale container up in [skydome-playbooks config](https://github.com/wealthsimple/skydome-playbooks/blob/master/containers/oracle-gl-publisher/app.prod.yml):
   - Adjust both `memory` and `-Xmx` (heap size)
   - **Must do an ad-hoc deploy** -- merges on skydome-playbooks do NOT trigger redeploy

---

## Update the Business Unit of an AP Account

**Previous examples:** [FLAMB-453](https://wealthsimple.atlassian.net/browse/FLAMB-453), [FLAMB-368](https://wealthsimple.atlassian.net/browse/FLAMB-368)

1. Log on to prod DB as `XX_LEDGER_EXEC` (credentials in 1Password)
2. Connect using the **service name** (pws1e for prod), NOT the SID
3. Run:
```sql
UPDATE XXBRK.XXBRKACCT SET BUSINESS_UNIT = 'DISC' WHERE ACCT_ID = 'AP01149P9CAD';
```

---

## Update Book Values

Book values are in ATTRIBUTE11 (debit/gain) or ATTRIBUTE12 (credit/loss) of a STAT line.

- **Normally**: Ops uses [Atlas Book Value Correction Tool](https://atlas.wealthsimple.com/tools/book_value_correction_tool/request-correction) (except for OPTIONs)
- **Book Value updates for non-SELL/TRANSFER types** --> route to Book Value Admins

### Manual Update (if needed)

```sql
-- Verify the exact lines first
SELECT * FROM GL.GL_JE_LINES x
WHERE x.JE_HEADER_ID = 2030785046
  AND x.JE_LINE_NUM = 2;

-- Update
UPDATE GL.GL_JE_LINES x
SET x.ATTRIBUTE11 = '720.0000000000'
WHERE x.JE_HEADER_ID = 2030785046
  AND x.JE_LINE_NUM = 2;
-- COMMIT!

-- Verify change and document before/after in the ticket
SELECT * FROM GL.GL_JE_LINES x
WHERE x.JE_HEADER_ID = 2030785046
  AND x.JE_LINE_NUM = 2;
```

---

## Update Natural Account for Inventory Account

Requires approval from **Sheri** or **Thomas**. Use `XX_LEDGER_EXEC` user.

```sql
-- Verify current value
SELECT natural_account FROM XXBRK.XXBRKACCT WHERE ACCT_ID = 'BR00251X3CAD';

-- Update
UPDATE XXBRK.XXBRKACCT x SET x.NATURAL_ACCOUNT = '120310' WHERE x.ACCT_ID = 'BR00251X3CAD';
```

Validate before and after the update.

---

## Update Data in Oracle

- Use the `XX_LEDGER_EXEC` user (credentials via 1Password; request access through the documented process if needed)
- If the operation is not within this user's abilities, raise an Oracle EBS request: [Data Stores service desk](https://wealthsimple.atlassian.net/servicedesk/customer/portal/81/group/208/create/860)

---

## Find GL Publisher Idempotency for a ledger_entry in IRS

Operations will reference `ledger_entry-` canonical IDs from manual charge imports.

**Conversion:** Replace `ledger_entry-` with `ManualCharge-`

Example: `ledger_entry-aiYl7eUvVV9oWBQqalTPY9erYRF` --> `ManualCharge-aiYl7eUvVV9oWBQqalTPY9erYRF`

Use the `ManualCharge-` key to search:
- [GL Publisher activities Preset dashboard](https://8a26d867.wealthsimple-aws-mpc.app.preset.io/superset/dashboard/3946/)
- Datadog logs

[Source code reference](https://github.com/wealthsimple/interest-rate-service/blob/7a70f7ebaf2a79b9f1826d90b46ee72fcf5f5449/components/revenue/app/models/concerns/sendable.rb#L15-L20)

---

## Debug Cheque Files Processor Tool Postings

See the [dedicated guide page](https://www.notion.so/1d041167bd968092a642fcd0723a5971).

---

## Redeploy GL Publisher

```shell
ws deploy -a oracle-gl-publisher -e production
```

- Pick the most recently deployed commit
- Safe operation: Kafka consumers rebalance, no messages dropped

---

## Find Ledger Lines for Aggregated Activities

### From idempotency key to ledger lines

1. Find the group_id:
   ```sql
   SELECT group_id
   FROM XXBRK.GL_WRITER_ACTIVITY_IMPORT
   WHERE idempotency_key = '<the-idempotency-key>';
   ```

2. Search using `GL_PUBLISHER_GROUP_ID_<the-group-id>`:
   ```sql
   SELECT *
   FROM gl.gl_je_lines gl
     JOIN gl.gl_je_headers gh ON gh.je_header_id = gl.je_header_id
     JOIN gl.gl_code_combinations codes ON gl.code_combination_id = codes.code_combination_id
     JOIN gl.gl_je_batches gb ON gh.je_batch_id = gb.je_batch_id
   WHERE gh.external_reference = 'GL_PUBLISHER_GROUP_ID_<the-group-id>'
   ORDER BY gl.attribute2 DESC;
   ```

> Results include ALL lines in the aggregated import. The brokerage account debit/credit is the net of all activities in the set.

### From ledger lines to original activities

1. Extract the group_id from the `external_reference` (after `GL_PUBLISHER_GROUP_ID_`)
2. Find all activities in the group:
   ```sql
   SELECT idempotency_key
   FROM XXBRK.GL_WRITER_ACTIVITY_IMPORT
   WHERE group_id = '<the_group_id_suffix>';
   ```
3. Filter by account ID if needed:
   ```sql
   SELECT *
   FROM gl_publisher.activities
   WHERE idempotency_key IN (<the_idempotency_keys>)
     AND JSON_EXTRACT_PATH_TEXT(json_activity, 'ClientActivity', 'accountId', 'accountId') = '<the_account_id>';
   ```

---

## Resend Audit Events for Completed GlWriterActivityImport

**When:** API container OOM caused `GlWriterActivityImport` to be set to COMPLETED without sending audit events.

**Fix:** Reset status to STARTED so ImportCheckService re-checks and sends audit events.

```sql
-- Use XX_LEDGER_EXEC user
UPDATE xxbrk.gl_writer_activity_import
SET status = 'STARTED'
WHERE group_id IN ('<the-group-ids-to-resend>');
-- OR: WHERE idempotency_key IN (...)
```

ImportCheckService will pick up records and resend audit events. Downstream consumers should be idempotent.

---

## Unknown Merchant Transaction - Debit/Credit

If a customer asks about an `Unknown Merchant` transaction, it may be a **merchant hold**.

- Share this SOP for releasing holds: [Merchant Holds vs Provisional Credits](https://app.getguru.com/card/Tbgokjzc/Merchant-Holds-vs-Provisional-Credits-)
- Reference ticket: [WOCOO-17284](https://wealthsimple.atlassian.net/browse/WOCOO-17284?focusedCommentId=3667450)

---

## Client Asking to Confirm Amounts Seen In-App

**Example:** [EOC-147084](https://wealthsimple.atlassian.net/browse/EOC-147084)

1. Use [this dashboard](https://8a26d867.wealthsimple-aws-mpc.app.preset.io/superset/dashboard/2047/) to find lines for the client's custodian account ID (H/W/C prefix)
2. Find the idempotency key (`external_reference` on the header) matching the amounts in the ticket
3. Use [this dashboard](https://8a26d867.wealthsimple-aws-mpc.app.preset.io/superset/dashboard/3946/) to see the `json_activity` message sent to GL Publisher
4. If the suspect amount matches what the client sees, triage to the appropriate team by updating the ticket's "Problem Area"

---

## Investigating and Resolving Missing CP Lines

**Problem:** Nightly Pending Current job fails to flip transactions from PP to CP status. CP lines appear missing, RECON jobs fail.

See: [Investigating and Resolving missing CP Lines](https://www.notion.so/2cd41167bd9680fe926afd5927336900)

---

## Correct Wrong Book Value After Stock Split

**Problem:** DAM tool uses previous day's closing quote for inventory transfers. On stock split day, this results in incorrect book value using the pre-split price.

**Solution:** Contact [money movement on-call](https://wealthsimple.enterprise.slack.com/archives/C03L8JLRZ1A) to run:
- [Reversal mtask](https://asset-movement-service.use1.pro1.production.w10e.com/maintenance_tasks/tasks/Maintenance::AssetMovementRequestReversalTask)
- [Price correction mtask](https://asset-movement-service.use1.pro1.production.w10e.com/maintenance_tasks/tasks/Maintenance::AssetMovementRequestPriceCorrectionTask)

---

## Key Dashboards & Tools

| Tool | URL |
|------|-----|
| Ledge - Journal Import | https://ledge.wealthsimple.com/journal-import |
| Ledge - Reversal | https://ledge.wealthsimple.com/reversal |
| Atlas Prod | https://atlas.wealthsimple.com |
| GL Publisher monitors | https://app.datadoghq.com/monitors/manage?q=oracle-gl-publisher |
| Ledge monitors | https://app.datadoghq.com/monitors/manage?q=ledge%20team%3Abor-write |
| GL Publisher dashboard | https://app.datadoghq.com/dashboard/bkq-7rr-msd/bor-oracle-gl-publisher |
| Oracle Status dashboard | https://app.datadoghq.com/dashboard/2ct-x2w-ckj/oracle-status |
| Stuck imports (Preset) | https://8a26d867.wealthsimple-aws-mpc.app.preset.io/explore/?dashboard_page_id=Ae2iC4h02A&slice_id=28874 |
| Failed/Stuck GL_INTERFACE (Preset) | https://8a26d867.wealthsimple-aws-mpc.app.preset.io/superset/dashboard/2116/ |
| Reversal verification (Preset) | https://8a26d867.wealthsimple-aws-mpc.app.preset.io/superset/dashboard/3535/ |
| GL Publisher activities (Preset) | https://8a26d867.wealthsimple-aws-mpc.app.preset.io/superset/dashboard/3946/ |
| Status mismatch (Preset) | https://8a26d867.wealthsimple-aws-mpc.app.preset.io/superset/dashboard/34262341-072d-4f45-8e6b-30c68fcfc521/ |
| GL Publisher Manage Containers | https://github.com/wealthsimple/oracle-gl-publisher/actions/workflows/manage_containers.yml |
| Ledge Manage Containers | https://github.com/wealthsimple/ledge/actions/workflows/manage_containers.yml |
| Oracle Support Slack | #oracle-support |
| BOR Write On-Call Slack | #bor-write-oncall |
| Streaming Platform On-Call | #streaming-platform-oncall |

## Key Oracle Users & IDs

| User | ID | Notes |
|------|----|-------|
| GL_PUBLISHER | 5468 | created_by value for GL Publisher records |
| XX_LEDGER_EXEC | -- | Credentials in 1Password. Use for direct Oracle updates. Connect via service name (pws1e for prod). |

---

## Investigating EF04 (Invalid Accounting Flexfield) Errors

**When**: Monitor "Activity failed in GL_INTERFACE" fires with errorCodes containing EF04.

### Step 1: Find the failing activity
```
Datadog Logs: service:oracle-gl-publisher @appenv:production status:error "Import failed"
```
Note the `idempotencyKey`, `groupId`, and `activityType` from the log.

### Step 2: Check GL_INTERFACE for the group
```sql
-- Preset (Redshift)
SELECT segment1, segment2, segment3, segment4, segment5, segment6,
       status, reference1, reference4, currency_code, accounting_date,
       request_id
FROM ledger_interface_gl_views.gl_interface
WHERE group_id = <GROUP_ID>;
```

### Step 3: Identify the bad segment value
The Oracle Import Execution Report will specify which segment is invalid. Common culprits:
- **segment4** (Sub Account) — account not synced to Oracle
- **segment5** (Asset ID) — security not in SEC_MA value set, or end-dated
- **segment3** (Natural Account) — new account code not yet created

### Step 4: For SEC_MA issues (segment5 / Asset ID)
```sql
-- Oracle: Check if value exists and is active in SEC_MA
SELECT flex_value, enabled_flag, start_date_active, end_date_active
FROM applsys.fnd_flex_values_vl
WHERE flex_value_set_id = (
  SELECT flex_value_set_id FROM applsys.fnd_flex_value_sets
  WHERE flex_value_set_name = 'SEC_MA'
)
AND flex_value = '<PADDED_ASSET_ID>';
```
If `end_date_active` is set and in the past, the value is expired → contact #sec-data-oncall or #oracle-support.

### Step 5: Re-import after fix
Once the value is re-enabled, re-import the group using the standard re-import procedure.

---

## Trade Settlement Date Correction via Ledge

**When**: Someone settled a trade on the wrong date and needs it corrected.

### Using the Trade Corrections form
1. Go to **Ledge Prod** → **Orders & Trades** → **Trade Corrections** (OrderSelectionForm)
2. Search for the trade by trade number
3. Select the trade → choose **Settlement Date Correction**
4. Enter the correct settlement date and a reason code
5. Submit

**Required role**: `ledge-tc-sdi-trade-desk`

**What it does**: Calls SO-Orders' `CorrectOrder` GraphQL mutation. SO-Orders handles reversing old GL entries and creating new ones with the correct date.

### If they need a full reversal instead
- The Ledge **Activity Reversal** tool can reverse settlements
- Required role: `ledge-reverse-batch-settlements`
- **Always require a Jira ticket first** (EOC or LW board) for audit trail

---

## Checking Oracle Connectivity During an Incident

**When**: Suspecting Oracle DB connectivity issues (ORA-03113, ORA-01653, timeouts).

### Quick checks (in order):
1. **[Oracle Status Dashboard](https://app.datadoghq.com/dashboard/2ct-x2w-ckj)** — Is Oracle itself healthy?
2. **[GL Publisher System Dashboard](https://app.datadoghq.com/dashboard/2ab-j69-39j)** — Is GL Publisher seeing Oracle?
3. **[Concurrent Managers](https://app.datadoghq.com/dashboard/5bv-qni-bpt)** — Are import jobs running or stuck?
4. **#oracle-support** Slack — Has someone already flagged it?

### Check if ImportCheckService is running:
```
Datadog Logs: service:oracle-gl-publisher @appenv:production "Scheduled Import Job Running"
```
If no recent logs → the job may be dead. Check pod health in Argo.

---

## Diagnose Transfer-In Book Value Bug

> **LO-2610** | First seen: Sep 2025 | Fixed in Ledge PR #3213 (deployed ~Feb 2026)

**Symptom:** Customer or ops reports $0 book cost after a Client Transfer In. Downstream: `bv_delta = BV_DR - BV_CR = 0 - X = negative` → clamped to $0 in positions/T5008.

**Root cause:** The Ledge form builder sent `destinationBvDelta` with the wrong sign (negative instead of positive). Oracle GL wrote `attribute12 (BV_CR) = X`, `attribute11 (BV_DR) = 0` on the client account line. Fixed in Ledge PR #3213 for new submissions. Historical records need the BV correction tool.

---

### Quick Diagnostic — Is this the BV_DR/BV_CR swap bug?

```sql
-- Check if a transfer-in line has BV on the wrong side
-- BV_CR should be 0 for a client receiving securities; BV_DR should have the value
SELECT
    l.effective_date,
    l.attribute3        AS tx_type,
    l.description,
    l.attribute11       AS bv_dr,   -- should be non-zero for Transfer In client line
    l.attribute12       AS bv_cr,   -- should be 0 for Transfer In client line
    c.segment4          AS account_id,
    c.segment5          AS listing_id
FROM apps.xxglarc_gl_je_lines l
JOIN apps.xxglarc_gl_je_headers h ON l.je_header_id = h.je_header_id
JOIN apps.gl_code_combinations c  ON l.code_combination_id = c.code_combination_id
WHERE c.segment4 = '<ACCOUNT_ID>'
  AND l.attribute3 IN ('TRFIN','E_TRFIN','TRFINTF','MBTRFIN','RSPTRFIN','SRSPTRFIN','AFT_IN')
  AND l.effective_date >= DATE '2025-09-24'
  AND h.ledger_id = 1
ORDER BY l.effective_date DESC;
```

**It's this bug if:** `bv_dr = 0` AND `bv_cr = <book value amount>` on the "Transfer In" description line.
**Affected window:** effective_date >= 2025-09-24 (GL Publisher migration) to ~Feb 2026 (when Ledge fix deployed).

---

### Remediation

**Step 1 — Fix Oracle GL** (cs-tools BV correction tool)

1. Identify affected `je_header_id` + `je_line_num` pairs from the query above
2. Create a BV correction work item via [Atlas Book Value Correction Tool](https://atlas.wealthsimple.com/tools/book_value_correction_tool/request-correction)
   - `bv_delta_old` = current wrong value (on CR side)
   - `bv_delta_new` = corrected value (move to DR side, i.e. attribute11)
3. OR raise an Oracle data fix PR in cs-tools (see [LO-2610 cs-tools PR pattern](https://github.com/wealthsimple/cs-tools/pull/7881))

> **Why not a reversing journal entry?** `attribute11`/`attribute12` are cost-basis metadata flex fields, NOT the primary double-entry accounting columns. The securities movement (`entered_dr`/`entered_cr`) is correct. Fixing the flex fields directly is the right approach — a reversal would unwind correct accounting and risk double-counting in SHOVEL views.

**Step 2 — Verify Oracle fix propagated** (auto, ~30 min)

The SHOVEL views recompute `BV_DELTA = attribute11 - attribute12` on every query, so once Oracle is fixed tx-streamer picks it up within 30 minutes. No action needed.

**Step 3 — Positions-calculator reprocessing** (manual, BOR team)

Oracle GL fix does NOT automatically update Kratos positions. Escalate to BOR team (#bor-write-on-call) to reprocess affected accounts in the positions-calculator for the corrected BV to flow through.

**Step 4 — T5008 impact check** (if disposals occurred in 2025)

```sql
-- Find affected accounts that SOLD the transferred-in securities before year-end
-- Run this to assess T5008 remediation scope
SELECT
    c.segment4          AS account_id,
    c.segment5          AS listing_id,
    l.effective_date    AS sell_date,
    l.attribute3        AS sell_type,
    l.entered_cr        AS qty_sold
FROM apps.xxglarc_gl_je_lines l
JOIN apps.xxglarc_gl_je_headers h ON l.je_header_id = h.je_header_id
JOIN apps.gl_code_combinations c  ON l.code_combination_id = c.code_combination_id
WHERE c.segment4 = '<ACCOUNT_ID>'
  AND l.attribute3 IN ('SL','SELL','TRSELL','RED','TRFOUT','E_TRFOUT','TRFOUTF')
  AND l.effective_date BETWEEN DATE '2025-09-24' AND DATE '2025-12-31'
  AND l.entered_cr > 0
  AND h.ledger_id = 1;
```

If disposals exist → **escalate to tax/finance team immediately**. T5008 Box 20 (cost/book value) will show $0 for those disposals. Amended T5008s may be required before the CRA March 31 filing deadline.

---

### T5008 Data Chain (compressed)

```
Oracle GL (attribute11/attribute12)
  └─ [auto, 30 min] → tx-streamer → bor-oracle-gl-transactions Kafka
       └─ [manual trigger needed] → positions-calculator → Kratos PostgreSQL
            └─ [manual trigger needed] → Leapfrog-for → S3 CSV receipts
                 └─ [manual rerun needed] → spark-report-processor T5008 Spark job
                      └─ T5008 Box 20 (adjusted_book_cost)
```

Fixing Oracle GL fixes steps 1-2 automatically. Steps 3-5 require explicit coordination with BOR and Data/Tax teams.

---

### Key Facts
| Field | Value |
|-------|-------|
| Affected tx types | TRFIN, E_TRFIN, TRFINTF, MBTRFIN, RSPTRFIN, SRSPTRFIN, AFT_IN |
| Affected window | 2025-09-24 → ~2026-02 (Ledge fix deployed) |
| Oracle column | attribute11 = BV_DR (debit), attribute12 = BV_CR (credit) |
| Bug: client Transfer In line | attribute11 = 0, attribute12 = X (wrong — should be reversed) |
| Fix: cs-tools pattern | [PR #7881](https://github.com/wealthsimple/cs-tools/pull/7881) |
| Ledge code fix | [PR #3213](https://github.com/wealthsimple/ledge/pull/3213) |
| T5008 source | spark-report-processor reads Kratos (NOT Oracle GL directly) |
