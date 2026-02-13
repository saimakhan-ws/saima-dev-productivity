# DLQ (Dead Letter Queue) Management Runbook

## Quick Reference

| Item | Link |
|------|------|
| DLQ Tool | https://atlas.wealthsimple.com/tools/gl_publisher_dlq |
| Required Role | "GL Publisher DLQ Manager" (request via access portal) |
| Oracle Transactions Inventory | https://www.notion.so/wealthsimple/Inventory-of-Oracle-transactions-sources-10b9e553499a4d599d745e3596f24e7c |
| Supported Transfers | https://www.notion.so/95294f2187aa4eb68bbd10329aba4791 |

---

## Decision Tree: What To Do With a DLQ Entry

```
DLQ entry appears
|
+-- Is it BrokerSideSettlement or a PTM activity?
|   |
|   +-- YES --> Is settlementType "CryptoBrokerageSettlement"?
|   |           |
|   |           +-- YES --> Reach out to #wscrypto-oncall
|   |           +-- NO  --> IGNORE for at least 1 full business day.
|   |                       PTM manages these themselves.
|   |                       If still lingering after 1 day --> ping #ptm-oncall
|   |
|   +-- NO  --> Continue below
|
+-- Is it AdministrativePayment with prefix "card-reward-payout-" and type CASHBACK?
|   |
|   +-- YES --> IGNORE completely. payment-cards team handles their own rollbacks.
|   +-- NO  --> Continue below
|
+-- Does it match a "Safe to Archive" pattern? (see section below)
|   |
|   +-- YES --> Archive without investigation.
|   +-- NO  --> Continue below
|
+-- Is the failure a JDBC timeout (and NOT a ManualJournal)?
|   |
|   +-- YES --> Safe to retry without reaching out to clients.
|   +-- NO  --> Continue below
|
+-- Is it a ManualJournal failure?
|   |
|   +-- YES --> Do NOT retry. Investigate first (see "Investigation Required").
|   +-- NO  --> Continue below
|
+-- Investigate the error before retrying (see "Investigation Required").
```

---

## Special Handling Rules

### 1. BrokerSideSettlement / PTM Activities

- **Default action:** IGNORE for at least 1 full business day. PTM has their own DLQ access and manages these.
- **If settlementType is `CryptoBrokerageSettlement`:** reach out to **#wscrypto-oncall** instead.
- **If still present after 1 business day:** ping **#ptm-oncall**.

### 2. AdministrativePayment -- Card Reward Payouts

- **Match:** prefix `card-reward-payout-` AND type `CASHBACK`
- **Action:** IGNORE completely. The payment-cards team handles their own rollbacks.

### 3. ManualJournal Failures

- **Action:** Do **NOT** retry without investigation. Always understand why it failed first.

### 4. JDBC Timeout Failures (non-ManualJournal)

- **Action:** Safe to retry without reaching out to clients.

---

## Safe to Archive (No Investigation Needed)

Archive these immediately -- no investigation required:

| Activity Type | Error Message Contains |
|---|---|
| `CryptoBrokerageStakingPoolReward` | "Quantity cannot be 0" |
| `brokerage_settlement-` prefixed activities | "Security Delta must be greater than 0" |
| `MoneyMovement` | "No active security for the following securitiesApiId was found" |
| `AdministrativePayments` or `Writeoffs` prefixed with `ManualCharge-` | *(any error)* |

---

## Investigation Required

> **Key principle:** Before retrying anything not covered above, understand **why** it failed. The sending system may have already resubmitted with a different ID.

### Error: "No account for the following id was found" / "Account not synced to Oracle"

```
Step 1: Wait.
         GL Publisher's JiraTicketService auto-creates a BOAO ticket
         and sets up an auto-retry.

Step 2: Still in the DLQ after 24 hours?
         Search Jira for the account ID (look for BOAO tickets).
         |
         +-- No BOAO ticket found?
         |   --> Consult the team. This indicates a bigger problem.
         |
         +-- BOAO ticket exists and was completed recently?
         |   --> Wait for the auto-retry to pick it up.
         |
         +-- BOAO ticket exists, completed a while ago, still in DLQ?
         |   --> Manually retry.
         |       Consult the team about why auto-retry did not fire.
         |
         +-- BOAO ticket was Rejected?
             --> Archive the DLQ entry.
```

### Error: "Transfer from [type] to [type] is not supported"

```
Step 1: Check the supported transfers page:
        https://www.notion.so/95294f2187aa4eb68bbd10329aba4791

Step 2: Is this transfer type listed as supported?
        |
        +-- NOT supported
        |   --> Notify the sending team and link them the supported transfers page.
        |
        +-- SHOULD be supported (listed on the page but still failing)
            --> Notify the sending team AND work with your team to investigate.
```

### All Other Errors

1. **Investigate** the root cause.
2. **Create a Jira ticket** under the **WRITE-2038** epic.
3. **Find the owning team** using the [Oracle Transactions Inventory](https://www.notion.so/wealthsimple/Inventory-of-Oracle-transactions-sources-10b9e553499a4d599d745e3596f24e7c).
4. **Post the ticket** to the owning team's on-call channel.
5. **Track progress** via the Jira link button in the DLQ details view.

---

## Useful SQL Queries

### Find activity details by idempotency key

```sql
SELECT *
FROM glpublisher.activities
WHERE idempotency_key = '<key>';
```

### Find activities by account ID

```sql
SELECT *
FROM glpublisher.activities
WHERE json_activity->'ClientActivity'->'accountId'->>'accountId' = '<account ID>';
```

### Find failed activities by type (preset)

```sql
SELECT idempotency_key,
       account_id,
       activity_type,
       transaction_type,
       failure_count,
       error_code,
       error_msg
FROM gl_publisher_public.failed_activities
WHERE activity_type = '<type>';
```

---

## Staging DLQ Cleanup (Optional)

Use this to bulk-archive old errors in staging environments:

```sql
UPDATE activities a
SET status = 'ARCHIVED'
WHERE 1=1
  AND a.status = 'ERROR'
  AND a.created_at < '2025-06-10 00:00:00'::timestamp;
```

> **Note:** Adjust the `created_at` threshold date as appropriate. This is for staging only.
