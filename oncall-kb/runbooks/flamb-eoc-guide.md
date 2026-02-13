# FLAMB/EOC Ticket Handling Guide -- BOR Write On-Call

> **Source documents:**
> - [Ledger Write: FLAMB/EOC guidelines](https://www.notion.so/1a141167bd96807d8415fdfc2090a873)
> - [FLAMB tickets for ATO remediation](https://www.notion.so/67cf48d1155040ca8596817219a89c56)
> - [On-Call checklist](https://www.notion.so/b6d76f11502d43f58af23e38e46d4819)
> - [FLAMB Scenarios](https://www.notion.so/14441167bd968094a9ccc52a5bbef343)
> - [Ledge Activity Reversal Handbook](https://www.notion.so/15b41167bd968070a760fba56a9997b2)
> - [Reversing Activities In The Ledger](https://www.notion.so/1fd0ef8add4e4b5f8ebeea04b78d3bc9)
> - [On-Call Handbook: HOW-TO](https://www.notion.so/5e19786b1c4c4538927de20faf9e32ad)
> - [BOR Write On-Call Handbook](https://www.notion.so/4563585ccca84762b94166058d9a1c96)

---

## Table of Contents

1. [FLAMB Ticket Decision Tree](#1-flamb-ticket-decision-tree)
2. [Reversal Ground Rules](#2-reversal-ground-rules)
3. [Labeling Requirements](#3-labeling-requirements)
4. [When to Redirect vs. Action](#4-when-to-redirect-vs-action)
5. [Internal Transfer Reversals](#5-internal-transfer-reversals)
6. [ATO Fraud Reversals Process](#6-ato-fraud-reversals-process)
7. [Book Value Corrections](#7-book-value-corrections)
8. [Common FLAMB Scenarios and Resolutions](#8-common-flamb-scenarios-and-resolutions)
9. [EOC Ticket Handling](#9-eoc-ticket-handling)
10. [Ticket Routing Guide](#10-ticket-routing-guide)
11. [Reversal Tooling Quick Reference](#11-reversal-tooling-quick-reference)
12. [SQL Reference Queries](#12-sql-reference-queries)

---

## 1. FLAMB Ticket Decision Tree

When a new FLAMB ticket arrives, follow this triage flow:

```
FLAMB ticket received
  |
  +--> Is essential info present? (custodian account ID, idempotency key)
  |      |
  |      NO --> Ask for more info in the ticket. Wait.
  |      |
  |      YES
  |        |
  |        +--> Is the request for a specific transaction?
  |        |      |
  |        |      YES --> Ensure the transaction idempotency_key is provided.
  |        |      |        (Ops may not have it -- search Oracle and add it yourself)
  |        |      NO  --> Proceed to classification
  |        |
  |        +--> Is this a COMMON type? (see common types below)
  |               |
  |               YES --> Move to the corresponding JIRA board
  |               |       (see Ticket Routing Guide, Section 10)
  |               |
  |               NO  --> Investigate and determine:
  |                       1. Add a summary of your investigation to the ticket
  |                       2. Propose a solution
  |                       3. If reversal is needed, follow the reversal process
  |                       4. Apply the appropriate label
  |                       5. If unclear, escalate to BOR-Write team
```

### Common FLAMB request types that should be REDIRECTED:

| Request Type | Redirect To |
|---|---|
| Internal transfer reversal (non-fraud) | BOPSIT (Ops self-serve via Ledge) |
| Manually posted transaction reversal | BOSM |
| Deposit reversal (EFT to TFSA/RRSP) | BOPSFUND |
| Managed account order issues | PMO |
| Giveaway/reward reversals | Tooth Fairy tool |
| Booking arbitrary activities (e.g., REFER rebooking) | Not FLAMB -- reject and explain |

---

## 2. Reversal Ground Rules

These are the 3 ground rules established by Estelle for processing reversals:

### Ground Rule 1: Identify the Root Cause

Every reversal request must have a clear root cause. Before processing any reversal, determine:
- **Was this a WS error?** (system double-post, wrong price, CXO agent mistake)
- **Was this a client error?** (client-initiated action they later regret, e.g. over-contribution)
- **Was this fraud?** (ATO, unauthorized transaction)

Label the ticket accordingly (see Section 3).

### Ground Rule 2: Approval Requirements

| Reversal Type | Approval Needed? |
|---|---|
| ATO fraud (`reversal_request_fraud`) with linked FRAUD ticket marked "Confirmed Suspicious" | **No** approval from Estelle/Roshan needed |
| WS error (`ws_error`) | Follow standard process; no delinquency check required by BOR Write (should be done before ticket is sent) |
| Client error (`client_error`) | May need approval from Estelle/Roshan depending on circumstances |
| All other / ambiguous cases | Escalate to Estelle/Roshan for approval |

### Ground Rule 3: Delinquency Checks

- For **ATO fraud reversals**: No need to check if the account would go delinquent. FFR team handles write-off/reimbursement after reversal. All ATO accounts are locked.
- For **WS error reversals**: It is NOT BOR Write on-call's job to confirm an account would not go delinquent. This should be done before the FLAMB ticket is sent to BOR Write.
- For **client error reversals**: Use the Account Inquiry Form in Ledge to verify the reversal will not cause delinquency.

---

## 3. Labeling Requirements

Apply one of these labels to every FLAMB ticket for tracking:

| Label | Root Cause | Description |
|---|---|---|
| `reversal_request_fraud` | Fraud/ATO | Reversal requests due to fraud. Mostly FLAMB tickets. |
| `client_error` | Client-initiated | Client initiated a request they later preferred did not happen (e.g., over-contribution to registered account). |
| `ws_error` | WS system or person error | CXO agent misunderstood client, system double-posted (Leapfrog/non-idempotent), wrong asset price, etc. |
| `transfer_ws_error` | Internal transfer WS error | Internal transfer reversal requests due to Wealthsimple's error. |
| `google_sheet` | Google Sheet errors | Trades/transfers completed with errors through MM Google sheets. |
| `manually_entered_typo` | Manual entry typo | Transactions manually posted were the root cause. |
| `bor-write-fundserv-issue` | Mutual funds | Mutual funds issues. |
| `bor-write-manual-corrections` | Manual journal errors | Errors in manual journal entries. |
| `book_value` | Book value issues | Book value related tickets. |
| `options` | Options issues | Options related tickets. |
| `mutual_funds_reversal_error` | Mutual fund reversal | Mutual funds reversal is the root cause of incorrect values. |
| `inaccurate_ticket_details` | Bad ticket info | Wrong information on key details that hindered initial investigation. |
| `insufficient_ticket_details` | Missing ticket info | Ticket initially lacks any substantial details that identify the transaction. |

---

## 4. When to Redirect vs. Action

### REDIRECT the ticket when:

1. **Internal transfer reversals (non-fraud):** Redirect to **BOPSIT**. Internal transfer reversals are no longer BOR Write's responsibility. Ops can self-serve these through the Ledge Activity Reversal tool.
   - Exception: ATO fraud internal transfer reversals ARE still BOR Write's responsibility.

2. **Manually posted/booked transactions:** Redirect to **BOSM**. BOSM handles reversals of transactions manually posted. BOR Write cannot reverse manually-booked entries (e.g., manual Sells, manual journal entries).

3. **EFT deposit reversals (TFSA/RRSP):** Redirect to **BOPSFUND**. BOPSFUND can reverse EFTs made to TFSAs/RRSPs to avoid affecting contribution room.

4. **Managed account corrections:** Redirect to **PMO**. If the reversal affects a managed account, a PMO ticket is needed since the managed algorithms may have already allocated the assets.

5. **Request is not a reversal:** Reject. The FLAMB board is specifically for activity reversal requests. Requests to "book arbitrary activities" should be rejected (e.g., FLAMB-256 where someone asked to rebook a REFER bonus).

6. **Transactions not searchable in Ledge:** If transactions are too old to find in Ledge, flag on `#bor-write-oncall` channel and determine if a FLAMB ticket is required.

### ACTION the ticket when:

1. **ATO fraud reversals** with a linked FRAUD ticket marked "Confirmed Suspicious."
2. **WS errors** where the transaction was posted via GL Publisher (automated posting) -- these can be reversed through Ledge.
3. **Complex or edge-case reversals** that do not fit standard Ops self-serve tooling.
4. **Batch-level issues** where multiple transactions are involved and surgical reversal is needed.

---

## 5. Internal Transfer Reversals

### KEY CHANGE: No Longer BOR Write Responsibility (for non-fraud cases)

Internal transfer reversals are now handled by **BOPSIT** (Operations) using the **Ledge Activity Reversal Tool**. BOR Write shipped self-serve reversal tooling in Ledge, so these tickets should no longer come to the FLAMB board.

If an internal transfer reversal ticket appears on FLAMB:
1. Check if it is fraud-related (ATO). If yes, process it (see Section 6).
2. If it is NOT fraud-related, redirect to **BOPSIT** with a note that Ops can self-serve via Ledge.

### Supported Idempotency Key Formats for Internal Transfers:

- Direct/cash transfer: `internal_transfer-<id>`
- Transfer through inventory (non-reg to reg): `asset_movement_request-<id>`
- Older format: `it-<id>`

### Notes on Internal Transfer Reversals:

- If the client wants the transfer effective on the same date as originally requested, a BOSM ticket is needed instead (BOSM can backdate).
- If the client does not care about the effective date, the reversal can be done in FLAMB.
- For managed accounts, check if a PMO ticket is needed first.

---

## 6. ATO Fraud Reversals Process

### What is ATO?

Account takeover fraud (ATO) is a form of identity theft where fraudsters overtake an online account and pose as real users. When discovered and marked suspicious, internal practice is to reverse the fraudulent activity on the Ledger.

### SLA: 3 business days to process ATO FLAMB tickets.

### Required Information:

The FLAMB ticket MUST include:
1. The **idempotency key** of the activities that need reversal
2. The **custodian account ID** (prefixed with H/W/C/etc.)
3. A **linked FRAUD ticket** with Investigation Outcomes set to **"Confirmed Suspicious"**

> **Important:** Look at the FRAUD ticket, NOT the FFR ticket. The FFR "Investigation Outcomes" is irrelevant for FLAMB tickets.

### Step 1: Before Performing the Reversal

- Verify the linked **FRAUD** ticket (not FFR) shows "Confirmed Suspicious"
- **No delinquency check needed** -- FFR team handles write-off/reimbursement after reversal
- **No approval from Estelle/Roshan needed** as long as the FRAUD ticket is "Confirmed Suspicious"
- All client accounts are locked for ATO remediation, so no risk of client moving funds
- Label the ticket with `reversal_request_fraud`

### Step 2: While Performing the Reversal

#### 2a. Verify the idempotency key is valid

Not all values that look like idempotency keys are real ones. Only entries posted by `gl-publisher` have idempotency keys. Entries via manual entry or Leapfrog will NOT have them.

Use this query to verify:

```sql
SELECT gl.effective_date, gl.entered_cr, gl.entered_dr, gl.description,
       gl.attribute3, gl.attribute4, gl.attribute6, gl.attribute19, gl.reference_5,
       gh.external_reference, codes.segment2, codes.segment3, codes.segment4,
       codes.segment5, codes.segment6, gb.je_batch_id
FROM gl.gl_je_lines gl
         JOIN gl.gl_je_headers gh ON gh.je_header_id = gl.je_header_id
         JOIN gl.gl_code_combinations codes ON gl.code_combination_id = codes.code_combination_id
         JOIN gl.gl_je_batches gb ON gh.je_batch_id = gb.je_batch_id
WHERE gh.external_reference = '<idempotency_key>';
```

If this returns results, it is a valid idempotency key. Proceed with normal reversal.

#### 2b. If NOT a valid idempotency key

Find the fraudulent transaction by querying all transactions on the account:

```sql
SELECT gl.effective_date, gl.entered_cr, gl.entered_dr, gl.description,
       gl.attribute3, gl.attribute4, gl.attribute6, gl.attribute19, gl.reference_5,
       gh.external_reference, codes.segment2, codes.segment3, codes.segment4,
       codes.segment5, codes.segment6, gb.je_batch_id
FROM gl.gl_je_lines gl
         JOIN gl.gl_je_headers gh ON gh.je_header_id = gl.je_header_id
         JOIN gl.gl_code_combinations codes ON gl.code_combination_id = codes.code_combination_id
         JOIN gl.gl_je_batches gb ON gh.je_batch_id = gb.je_batch_id
WHERE codes.segment4 = '<account_id>';
```

Match the entry by date and credit/debit amounts from the FLAMB ticket.

Then check if it is the only transaction in its batch:

```sql
SELECT gl.effective_date, gl.entered_cr, gl.entered_dr, gl.description,
       gl.attribute3, gl.attribute4, gl.attribute6, gl.attribute19, gl.reference_5,
       gh.external_reference, codes.segment2, codes.segment3, codes.segment4,
       codes.segment5, codes.segment6, gb.je_batch_id
FROM gl.gl_je_lines gl
         JOIN gl.gl_je_headers gh ON gh.je_header_id = gl.je_header_id
         JOIN gl.gl_code_combinations codes ON gl.code_combination_id = codes.code_combination_id
         JOIN gl.gl_je_batches gb ON gh.je_batch_id = gb.je_batch_id
WHERE gb.je_batch_id = '<batch_id>';
```

- If the **only entries** in the batch are from the fraudulent transaction: **reverse the whole batch**.
- If there are **other non-fraudulent entries** in the batch: **escalate to the BOR-WRITE team** -- do NOT reverse the entire batch.

#### 2c. P2P Reversals

For P2P reversals, there will be **two idempotency keys**, one for each side. Look for a wildcard on the idempotency key: `payment-123%`.

### Step 3: After Reversing

1. **Confirm the reversal went through** by checking GL Publisher logs:
   - Use Datadog filter: `@idempotency_key:<the-reversal-idempotency-key>`
   - The reversal idempotency key is shown in Ledge after submitting the reversal request
2. If the original transaction went through GL Publisher, check the [Preset dashboard](https://8a26d867.wealthsimple-aws-mpc.app.preset.io/superset/dashboard/3535/)
3. Comment on the ticket that the reversal has been completed
4. Mark the ticket as **DONE**

---

## 7. Book Value Corrections

Book value tickets are labeled `book_value`. These typically arise when:

- An internal transfer reversal causes incorrect book cost display
- A reversal was processed without book value (BV of 0), causing downstream issues in Poseidon/Kratos
- Client alleges book cost after an internal transfer is incorrect

### Handling Book Value Issues:

1. Check if the book value discrepancy is a result of a previous reversal
2. Verify in Oracle whether the book value was correctly carried during the transfer
3. If the reversal entry has BV=0, this likely caused downstream services to misclassify the transaction
4. For complex book value corrections that require manual journal entries, escalate or open a BOSM ticket

### Important:

- Book value corrections that require order cancellation + reversal + reprocessing should go through the appropriate team (e.g., PMO for managed accounts)
- Do NOT attempt to "fix" book values by posting arbitrary entries

---

## 8. Common FLAMB Scenarios and Resolutions

### Scenario 1: MF Transaction Recon Table Updates

**Context:** The `xxbrk.xxbrk_mf_transaction_recon` table sometimes has incorrect/typo'd account numbers.

**Process:**
1. Get approval from Sheri (if on vacation, ensure Kwaw is aware)
2. Execute the update using the `XX_LEDGER_EXEC` user (creds in 1Password):

```sql
UPDATE xxbrk.xxbrk_mf_transaction_recon
SET TR_DLR_ACCT_ID = '<the-correct-account>'
WHERE TR_DLR_ACCT_ID = '<the-incorrect-account>';
```

3. Commit the transaction (IntelliJ, SQL Developer, etc.)
4. Paste the update commands into the ticket

### Scenario 2: Double-Posted Transactions (ws_error)

Commonly caused by Leapfrog (non-idempotent). The long-term fix is moving all write paths to GL Publisher (idempotent).

**Resolution:** Reverse the duplicate entries via Ledge.

### Scenario 3: Client Over-Contribution to Registered Account (client_error)

Client contributed more than allowed to TFSA/RRSP and wants it reversed.

**Resolution:** Ops can now self-serve these through the Ledge reversal tool. Redirect to BOPSIT.

### Scenario 4: Wrong Account on Transfer (transfer_ws_error)

CXO agent transferred to wrong account or transferred full in-kind instead of partial.

**Resolution:**
- If automated transfer: can be reversed via FLAMB/Ledge
- If manual transfer: redirect to BOSM

### Scenario 5: Transaction Cannot Be Found in Ledge

Sometimes transactions are too old or were not posted through GL Publisher.

**Resolution:**
- Query Oracle directly using the SQL queries in Section 12
- If the batch contains mixed transactions (fraud + legitimate), escalate

### Scenario 6: Securities Reversal on Manually-Booked Entries

BOR Write cannot reverse manually-booked entries (e.g., manual Sells).

**Resolution:** Redirect to BOSM for manual transaction reversals.

### Scenario 7: Fee Reversals

Fee reversals follow separate guiding principles. There may be extenuating circumstances like incidents that require an alternative approach.

**Resolution:** If uncertain about a fee reversal, open a ticket for review.

---

## 9. EOC Ticket Handling

### Daily Checklist for EOC

The on-call engineer should review the EOC WRITE Jira board daily:
- [BOR-Write EOC board](https://wealthsimple.atlassian.net/jira/software/c/projects/EOC/boards/301)
- Follow up on existing tickets
- Triage new tickets to the correct team

### When to Redirect EOC Tickets:

| Issue Type | Redirect To |
|---|---|
| Balance discrepancies / position issues | BOR Calc / BOR Read |
| Internal transfer processing issues | BOR Inflight (`#bor-inflight-oncall`) |
| Statement/tax slip issues | BOR STAR |
| Manually-posted transaction issues | BOSM |
| Rate of return / book value display issues | BOR Calc |
| Issues with how activities appear in the app | BOR Read |

### What Data to Include in EOC Tickets:

When creating or passing along an EOC ticket, ensure it contains:
1. **Custodian account ID** (H/W/C prefixed)
2. **Idempotency key(s)** of the affected transaction(s)
3. **Effective date(s)** of the transaction(s)
4. **Description of the issue** -- what is wrong and what is expected
5. **Investigation summary** -- what you found when you looked into it
6. **Proposed solution** -- your recommendation for resolution
7. **Links to any related tickets** (FLAMB, FRAUD, BOPSIT, etc.)

### EOC Ticket Lifecycle:

1. New ticket arrives on BOR-Write EOC board
2. Verify it belongs to BOR Write (if not, redirect)
3. Investigate using Oracle queries and Preset dashboards
4. Document findings on the ticket
5. Process the resolution or escalate
6. Comment with resolution details
7. Mark as DONE

---

## 10. Ticket Routing Guide

### Which Board for Which Issue Type:

| Issue Type | Board | Slack Channel |
|---|---|---|
| **Activity reversals (automated/GL Publisher)** | FLAMB | `#bor-write-oncall` |
| **ATO fraud reversals** | FLAMB | `#bor-write-oncall` |
| **Internal transfer reversals (non-fraud)** | BOPSIT | N/A (Ops self-serve) |
| **Manual transaction reversals** | BOSM | N/A |
| **EFT deposit reversals (TFSA/RRSP)** | BOPSFUND | N/A |
| **Managed account order issues** | PMO | N/A |
| **Ledger discrepancies / investigation** | EOC (BOR-Write) | `#bor-write-oncall` |
| **Balance/position/return issues** | EOC (BOR Calc) | `#bor-calc-oncall` |
| **Transaction stuck in processing** | EOC (BOR Inflight) | `#bor-inflight-oncall` |
| **Statement/tax slip issues** | EOC (BOR STAR) | `#bor-oncall` |
| **GL Publisher stuck/failed records** | WRITE (epic: WRITE-2038) | `#bor-write-oncall` |
| **Mutual funds issues** | FLAMB (label: `bor-write-fundserv-issue`) | `#bor-write-oncall` |
| **Transaction type codes (Oracle)** | FLAMB then PLAT | `#bor-write-oncall` |
| **Book value corrections** | FLAMB (label: `book_value`) | `#bor-write-oncall` |

### Key Slack Channels:

| Channel | Purpose |
|---|---|
| `#bor-write-oncall` | BOR Write on-call questions and escalations |
| `#bor-write-alerts` | Automated alerts for the Write team |
| `#ledger-mgmt-oncall` | Ledger management on-call coordination |
| `#bor-inflight-oncall` | BOR Inflight EOC questions |
| `#ledge-support` | Ledge tool support and access requests |
| `#bor-eng` | General BOR engineering questions |

### Key JIRA Boards:

| Board | URL |
|---|---|
| FLAMB | https://wealthsimple.atlassian.net/jira/software/projects/FLAMB/boards/849 |
| EOC (BOR-Write view) | https://wealthsimple.atlassian.net/jira/software/c/projects/EOC/boards/301 |
| WRITE | https://wealthsimple.atlassian.net/jira/software/projects/WRITE |

---

## 11. Reversal Tooling Quick Reference

### Ledge -- Activity Reversal (for Ops/CX, engineers)

**URL:** https://ledge.wealthsimple.com/

**Two methods available:**

#### Method A: Reversal By Jira (Engineers Only)
1. Navigate to **Engineering** > **Reversal By Jira**
2. Enter the JIRA ticket number and click "Search"
3. Select the batches to reverse
4. Click "Preview and Submit"
5. Review and click "Submit Batch Reversals"

#### Method B: Reversal By Activity (Ops + Engineers)
1. Navigate to **Customer Care** > **Activity Reversal**
2. Enter the idempotency key(s) and click "Search"
3. Select the correct activity
4. Click "Preview and Submit"
5. Enter the related JIRA ticket
6. Check the confirmation box
7. Click "Submit"

**Supported Activity Types:**

| Activity Type | Sample Idempotency Key | Permitted Operations Teams |
|---|---|---|
| InternalTransfer | `internal_transfer-<id>` or `asset_movement_request-<id>` | Internal Transfers Ops + BOSM |
| Writeoff | `manual_charge-<id>` | Delinquencies Ops + BOSM |
| P2P | `payment-<id>` | Cash Ops + BOSM |

**Key Validations in the Tool:**
- **Managed Account Warning:** Prompts to open a PMO ticket for managed accounts
- **Cross Tax Seasons Warning:** Alerts if reversal affects registered accounts across tax periods
- **Multiple Idempotency Keys Warning:** Alerts if multiple activities match

**Manual Checks Still Required:**
1. Balance check -- verify reversal will not cause delinquency (use Account Inquiry Form)
2. Subsequent transactions -- verify no related transactions occurred after the one being reversed

> **IMPORTANT: Reversal entries CANNOT be undone.** Carefully review all validations before submitting.

### Reversal Audit Dashboard

[Preset Dashboard for Reversal Auditing](https://8a26d867.wealthsimple-aws-mpc.app.preset.io/superset/dashboard/4643/)

This dashboard shows:
- What was reversed, when, and by whom
- Link to the related JIRA ticket
- Detailed GL_JE_LINES breakdown
- A scheduled report runs daily at 4PM EST and emails Sheri

### Access to Reversal Tool

To request access:
1. Go to Okta: https://wealthsimple.okta.com/enduser/resource/catalog/entry/cenai4kh1cchbQEKj0h5
2. Search for `Ledge (Production)`
3. Select access level `ledge-reversal`
4. Enter reason and submit
5. Approval needed from one of the current approvers

---

## 12. SQL Reference Queries

### Get a transaction from an idempotency key

```sql
SELECT gl.effective_date, gl.entered_cr, gl.entered_dr, gl.description,
       gl.attribute3, gl.attribute4, gl.attribute6, gl.attribute19, gl.reference_5,
       gh.external_reference, codes.segment2, codes.segment3, codes.segment4,
       codes.segment5, codes.segment6, gb.je_batch_id
FROM gl.gl_je_lines gl
         JOIN gl.gl_je_headers gh ON gh.je_header_id = gl.je_header_id
         JOIN gl.gl_code_combinations codes ON gl.code_combination_id = codes.code_combination_id
         JOIN gl.gl_je_batches gb ON gh.je_batch_id = gb.je_batch_id
WHERE gh.external_reference = '<idempotency_key>';
```

### List all transactions on an account

```sql
SELECT gl.effective_date, gl.entered_cr, gl.entered_dr, gl.description,
       gl.attribute3, gl.attribute4, gl.attribute6, gl.attribute19, gl.reference_5,
       gh.external_reference, codes.segment2, codes.segment3, codes.segment4,
       codes.segment5, codes.segment6, gb.je_batch_id
FROM gl.gl_je_lines gl
         JOIN gl.gl_je_headers gh ON gh.je_header_id = gl.je_header_id
         JOIN gl.gl_code_combinations codes ON gl.code_combination_id = codes.code_combination_id
         JOIN gl.gl_je_batches gb ON gh.je_batch_id = gb.je_batch_id
WHERE codes.segment4 = '<account_id>';
```

### List all transactions in a batch

```sql
SELECT gl.effective_date, gl.entered_cr, gl.entered_dr, gl.description,
       gl.attribute3, gl.attribute4, gl.attribute6, gl.attribute19, gl.reference_5,
       gh.external_reference, codes.segment2, codes.segment3, codes.segment4,
       codes.segment5, codes.segment6, gb.je_batch_id
FROM gl.gl_je_lines gl
         JOIN gl.gl_je_headers gh ON gh.je_header_id = gl.je_header_id
         JOIN gl.gl_code_combinations codes ON gl.code_combination_id = codes.code_combination_id
         JOIN gl.gl_je_batches gb ON gh.je_batch_id = gb.je_batch_id
WHERE gb.je_batch_id = '<batch_id>';
```

### Update MF transaction recon table (requires approval from Sheri)

```sql
-- Use XX_LEDGER_EXEC user, creds in 1Password
UPDATE xxbrk.xxbrk_mf_transaction_recon
SET TR_DLR_ACCT_ID = '<the-correct-account>'
WHERE TR_DLR_ACCT_ID = '<the-incorrect-account>';
-- COMMIT after execution
```

### Verify reversal in GL Publisher logs (Datadog)

```
@idempotency_key:<the-reversal-idempotency-key>
```

---

## Quick Reference Card

| Question | Answer |
|---|---|
| Where is the FLAMB board? | https://wealthsimple.atlassian.net/jira/software/projects/FLAMB/boards/849 |
| Where is the EOC board (Write view)? | https://wealthsimple.atlassian.net/jira/software/c/projects/EOC/boards/301 |
| Where is Ledge? | https://ledge.wealthsimple.com/ |
| Who approves non-fraud reversals? | Estelle / Roshan |
| Who approves MF recon table updates? | Sheri (backup: Kwaw) |
| SLA for ATO FLAMB tickets? | 3 business days |
| Do I need delinquency check for ATO? | No |
| Internal transfer reversals -- who handles? | BOPSIT (Ops self-serve), unless fraud |
| Reversal audit dashboard? | https://8a26d867.wealthsimple-aws-mpc.app.preset.io/superset/dashboard/4643/ |
| GL Publisher activity dashboard? | https://8a26d867.wealthsimple-aws-mpc.app.preset.io/superset/dashboard/3535/ |
| Idempotency key lookup dashboard? | https://8a26d867.wealthsimple-aws-mpc.app.preset.io/superset/dashboard/4334 |

---

*Last updated: 2026-02-13*
