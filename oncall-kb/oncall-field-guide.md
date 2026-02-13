# BOR Write On-Call Field Guide

## How to Read This Document

Think of this as your senior teammate sitting down with you over coffee before your first shift. This is not a reference doc -- we have those, and you will find links to them throughout. This is the "here is what you will actually see at 9 AM on a Monday, and here is what to do about it" briefing.

It is based on 90 days of real alert data (161 Slack threads, ~100 EOC tickets, dozens of FLAMB tickets) from November 2025 through February 2026. The patterns are real. The frequencies are real. The advice comes from the people who handled them.

---

## The Landscape: What You'll Be Watching

You have **three Slack channels**, **two Jira boards**, a **DLQ tool**, and **Preset dashboards**. Here is what each one is for.

**Slack Channels:**
- **#bor-write-alerts** -- Your main alert firehose. Sentry errors, PagerDuty pages, automated Preset alerts. 161 threads in 90 days, ~12/week. Most of your reactive work starts here.
- **#bor-write-oncall** -- Where humans ask you questions. EOC tickets get discussed here, ops teams ping you, and you coordinate with teammates.
- **#ledger-mgmt-oncall** -- The broader ledger management on-call coordination channel. "Account not synced to Oracle" tickets get redirected here.

**Jira Boards:**
- **FLAMB** (https://wealthsimple.atlassian.net/jira/software/projects/FLAMB/boards/849) -- Reversals, corrections, and ledger adjustments. Ops submits these when a transaction needs to be undone. Steady volume of ~50 new tickets per quarter.
- **EOC BOR-Write view** (https://wealthsimple.atlassian.net/jira/software/c/projects/EOC/boards/301) -- Client-facing issues that land on your desk: "account not synced," recon breaks, book value discrepancies. About 50 tickets/week across all EOC, a subset lands on BOR Write.

**DLQ Tool** (https://atlas.wealthsimple.com/tools/gl_publisher_dlq) -- Where GL Publisher messages go to die (temporarily). When an activity cannot be posted to Oracle, it lands here. You need "GL Publisher DLQ Manager" role to access it.

**Preset Dashboards:**
- GL Publisher activity dashboard (dashboard/3535) -- See what has been posted, what is stuck
- Reversal audit dashboard (dashboard/4643) -- Track what was reversed, by whom, with JIRA links
- Idempotency key lookup (dashboard/4334) -- Find specific transactions by key

---

## The Top 15 Ticket Types You'll See

### 1. Oracle Errors / ORA- Codes
- **What it looks like**: Sentry alerts from oracle-gl-publisher with ORA- error codes (e.g., ORA-00060 deadlock, ORA-01017 invalid credentials, ORA-12541 no listener). 36 of 161 Slack threads came from oracle-gl-publisher directly.
- **Why it happens**: GL Publisher talks to Oracle EBS constantly. Oracle connection issues, locked users (`xxbrk`), or database maintenance cause a cascade of errors.
- **How common**: 63 Slack threads mentioned "Oracle" in 90 days (39% of all threads). 23 threads had specific ORA- codes (14%).
- **What to do**:
  1. Check if it is a known Oracle maintenance window (ask in #bor-write-oncall)
  2. If ORA-01017 (credentials) -- check if `xxbrk` user is locked
  3. If connection errors -- check Oracle datasource health in Ledge/GL Publisher logs
  4. Most Oracle errors auto-recover. Watch for 15-30 minutes before intervening.
  5. If GL records are piling up unposted, that is when it becomes urgent -- check `SELECT COUNT(*) FROM gl_interface_record WHERE posted = false;`
- **Pro tip**: Oracle errors co-occur with "import" (19 threads) and "deploy" (15 threads). If you see Oracle errors right after a deploy, the deploy likely broke something -- consider a rollback.

### 2. Account Not Synced to Oracle
- **What it looks like**: EOC tickets titled "Account not synced to Oracle: WK____CAD" or "HQ____CAD". The AIAgent sometimes auto-triages these but frequently errors out.
- **Why it happens**: New accounts or migrated accounts (especially margin accounts) fail to sync from so-accounts to Oracle. Root causes include BART ownership conflicts, identity conflicts, or margin account type not being set.
- **How common**: Highest-volume recurring EOC ticket type. 14 individual tickets found in just the Dec 2025 - Feb 2026 window (EOC-151632, EOC-150418, EOC-150419, EOC-150422, EOC-150423, EOC-151441, EOC-150297, EOC-150083, EOC-150082, EOC-150055, EOC-149474, EOC-149056, EOC-148370, and more).
- **What to do**:
  1. Try manual backend sync of the account to Oracle
  2. For corp accounts: if backend sync fails, escalate to the BOAO board -- the account may not exist in Oracle at all (see EOC-149474)
  3. For margin accounts: check if the margin account type is set in Oracle. If not, finance reports will not show the account.
  4. If there are BART ownership conflicts, coordinate with BOAO for resolution
- **Real example**: EOC-149474 -- Corp account synced on backend, then reran checklist for two pending corporate deposits. Engineer noted: "if it recurs, the account may not be in Oracle at all -- ticket to BOAO."
- **Pro tip**: The AIAgent frequently errors on these tickets with "Bad Request." Do not wait for it. Just do the manual sync.

### 3. DLQ Failures
- **What it looks like**: Messages accumulating in the GL Publisher DLQ tool. Slack threads discussing "DLQ" or "dead letter."
- **Why it happens**: Malformed activity payloads, account sync issues, unsupported transfer types, JDBC timeouts, or ManualJournal errors.
- **How common**: 14 Slack threads in 90 days (8.7%). DLQ + Oracle co-occurred in 11 threads. DLQ + failed co-occurred in 8 threads.
- **What to do**: Follow the decision tree in the DLQ runbook. The short version:
  1. **BrokerSideSettlement/PTM** -- Ignore for 1 business day, PTM manages their own
  2. **CryptoBrokerageSettlement** -- Reach out to #wscrypto-oncall
  3. **Card reward payouts** (card-reward-payout- prefix, CASHBACK type) -- Ignore completely
  4. **"Safe to Archive" patterns** (CryptoBrokerageStakingPoolReward with "Quantity cannot be 0", etc.) -- Archive immediately
  5. **JDBC timeout (non-ManualJournal)** -- Safe to retry
  6. **ManualJournal** -- Do NOT retry. Investigate first.
  7. **"Account not synced"** errors -- GL Publisher auto-creates a BOAO ticket. Wait 24h for auto-retry.
  8. Everything else -- Investigate before retrying
- **Pro tip**: The DLQ tool has a "Jira link" button in the details view. Use it to track issues under the WRITE-2038 epic.

### 4. Stuck/Failed GL Imports
- **What it looks like**: Slack alerts about entries stuck in unposted (U) status, or "import" and "stuck" mentioned together. Preset alerts for transactions not in P (posted) state older than 2-3 hours.
- **Why it happens**: Oracle EBS posting program not running, Oracle maintenance/archiving, or a new GL Publisher source missing its auto-post configuration.
- **How common**: 29 threads mentioned "import," 13 mentioned "stuck." "import + stuck" co-occurred in 11 threads.
- **What to do**:
  1. Check `GL_JE_BATCHES` for import errors -- this tells you if Oracle is the problem
  2. If a new source was recently added, check if the auto-post concurrent program is enabled (see FLAMB-785)
  3. For mass stuck transactions after an Oracle incident, use the `reimport-gl-batch.py` script for bulk reimport (see FLAMB-135 -- 179+ transactions reimported this way)
  4. If entries are in GL_INTERFACE but not imported: escalate to Oracle DBA team. This is not a GL Publisher problem.
- **Real example**: FLAMB-785 -- FxTrade activities stuck in status U after a GL Publisher source change. Fix was enabling the auto-post concurrent program for BROKER_FX source.
- **Pro tip**: If it has been less than 2-3 hours, it might just be Oracle being slow. The Preset alert threshold exists for a reason.

### 5. HikariCP Connection Pool Exhaustion (Ledge)
- **What it looks like**: Ledge requests hanging or timing out. Logs showing "Connection is not available, request timed out." Users reporting blank pages or frozen forms.
- **Why it happens**: Ledge has 20 connections per Oracle datasource (TWS2E, SWS1E, SWS2E). Long-running Oracle queries or connection leaks exhaust the pool.
- **How common**: Ledge was involved in 23 of 161 Slack threads (14%). Connection pool exhaustion is called out as the most common Ledge failure mode.
- **What to do**:
  1. Check HikariCP active connections -- approaching 20 per datasource means imminent exhaustion
  2. **Redeploy the affected pod(s).** This is the standard fix. A rolling restart is sufficient.
  3. Watch the HikariCP pending requests metric. Sustained pending requests = pool is saturated.
  4. Deploy during low-usage windows if possible -- Vaadin is stateful, so restarts drop active user sessions.
- **Pro tip**: If you see p99 HTTP latency above 5s on Ledge, it is probably Oracle or GL Publisher being slow, which then causes pool exhaustion. Fix the upstream problem.

### 6. Optimistic Locking / GL Publisher Processing Failures
- **What it looks like**: Activities stuck in PROCESSING status, consumer lag growing on the `gl-publisher-tx-ingress-stream` Kafka topic.
- **Why it happens**: Concurrent processing of related activities can cause optimistic locking exceptions. Impact builder errors from malformed activity data. FPL activity failures can block the entire pipeline.
- **How common**: Part of the "failed" keyword group (25 threads, 15.5%) and the Oracle-related alerts.
- **What to do**:
  1. Check which activity type is failing: `SELECT status, COUNT(*) FROM activity WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY status;`
  2. Look for activities stuck in PROCESSING: `SELECT id, activity_type, status, created_at FROM activity WHERE status = 'PROCESSING' AND created_at < NOW() - INTERVAL '1 hour';`
  3. If it is a specific activity type, check the impact builder logs for that type
  4. May need to manually transition activity status in PostgreSQL if truly stuck
- **Real example**: RI-3889 -- GL Publisher stopped processing orders due to FPL activity failures. ~8,000 unposted orders threatened reconciliation.
- **Pro tip**: If only one activity type is failing and others are fine, the issue is likely bad data from the sending system, not GL Publisher itself.

### 7. Deploy-Related Alerts
- **What it looks like**: A burst of Sentry errors immediately following a deploy to oracle-gl-publisher or ledge. Threads mentioning "deploy" or "redeploy."
- **Why it happens**: New code introduces bugs, config changes break Oracle connectivity, or Kafka consumers need resetting.
- **How common**: 18 Slack threads (11.2%). "deploy + Oracle" co-occurred in 15 threads. "deploy + failed" in 4.
- **What to do**:
  1. Correlate the timing -- did errors start right after a deploy?
  2. Check the deploy diff for Oracle-related changes (connection config, new sources, new impact builders)
  3. If the deploy clearly caused the issue, rollback: `ws deploy -a <service> -e production -b <previous-sha>`
  4. For Ledge: remember Vaadin is stateful. Deploys terminate active user sessions. Deploy outside business hours when possible.
- **Real example**: Thread #3 in the Slack data -- Saima asked "Should we attempt a redeploy if requests are failing" after a Ledge deployment caused connection issues with Pantheon.
- **Pro tip**: For Ledge, a redeploy also fixes HikariCP pool exhaustion even without code changes. It is the Swiss army knife.

### 8. Kafka Lag / Audit Stream Issues
- **What it looks like**: Dashboard showing growing consumer lag on GL Publisher ingress or audit topics. Threads mentioning "Kafka" or audit-status-processor.
- **Why it happens**: Slow processing (often due to Oracle issues), pod health problems, or need to scale up consumers.
- **How common**: 7 Kafka-specific threads (4.3%), plus audit-status-processor appeared in 4 threads. Kafka + Oracle co-occurred in 5 threads.
- **What to do**:
  1. Check pod health and memory first
  2. If lag is growing because processing is slow, fix the processing bottleneck (usually Oracle)
  3. May need to scale up consumers
  4. If consumers need resetting, coordinate with the team before redeploying
- **Pro tip**: Kafka lag is usually a symptom, not a cause. When you see it, look for the real problem upstream -- Oracle connectivity, stuck activities, or memory issues.

### 9. FLAMB Reversal Requests
- **What it looks like**: Tickets on the FLAMB board requesting activity reversals. Labels include `ws_error`, `client_error`, `reversal_request_fraud`.
- **Why it happens**: CX ops agents made errors, systems double-posted (non-idempotent Leapfrog), or ATO fraud needs remediation.
- **How common**: 9 Slack threads mentioned "reversal" (5.6%). FLAMB board is in the 800+ ticket range.
- **What to do**:
  1. **First**: Is essential info present? (custodian account ID, idempotency key). If not, ask for it.
  2. **Then**: Should you redirect it? Internal transfer reversals (non-fraud) go to BOPSIT. Manual transaction reversals go to BOSM. EFT deposit reversals (TFSA/RRSP) go to BOPSFUND.
  3. **If ATO fraud**: Verify the linked FRAUD ticket shows "Confirmed Suspicious." No delinquency check needed. No approval from Estelle/Roshan needed. SLA is 3 business days.
  4. **If WS error**: Use Ledge Activity Reversal tool. Either "Reversal By Jira" or "Reversal By Activity."
  5. **After reversing**: Confirm via Datadog (`@idempotency_key:<reversal-key>`), comment on ticket, mark DONE.
- **Real example**: BOPSIT-139752 -- ATO confirmed, reverse fraudulent internal transfer of $1,200.44. Required coordination across FFR, BOPSIT, and FLAMB boards.
- **Pro tip**: Reversal entries CANNOT be undone. Triple-check before submitting. For P2P reversals, there will be two idempotency keys (one per side) -- search with a wildcard like `payment-123%`.

### 10. Book Value Corrections
- **What it looks like**: EOC tickets or FLAMB tickets (label: `book_value`) about incorrect book cost after transfers. Often from institutional transfers or previous corrections gone wrong.
- **Why it happens**: Institutional transfers booked via Ledge can produce negative BV_DELTA values (a known gap). Previous corrections via Fort Knox can introduce new errors if not carefully reviewed. Private placement transfers may lack standard documentation.
- **How common**: Multiple BOOKCOST board tickets per month (BOOKCOST-3675, BOOKCOST-3568, BOOKCOST-3573, BOOKCOST-3595, BOOKCOST-3589, BOOKCOST-3643). EOC-151473 showed a negative BV_DELTA of -4200.
- **What to do**:
  1. Check if the discrepancy is from a previous reversal or transfer
  2. Verify in Oracle whether book value was correctly carried
  3. For corrections that need manual journal entries, escalate or open a BOSM ticket
  4. Do NOT attempt to "fix" book values by posting arbitrary entries
  5. For managed accounts, check if a PMO ticket is needed
- **Real example**: BOOKCOST-3568 -- Previous corrections introduced MORE mistakes. Had to re-correct.
- **Pro tip**: Book value discrepancies between Atlas and mobile can be transient (see EOC-149493 -- self-resolved). Verify with the standard calculation logic before taking action.

### 11. Stuck State Machines
- **What it looks like**: EOC tickets reporting transactions stuck in "pending" states for 1+ days. Common stuck states include `pending_execution`, `pending_reservation`, `pending_balance_service_sync`, and `posting`. Clients see transfers or orders frozen in their UI with no progress.
- **Why it happens**: State machines that drive orders, internal transfers, and funding workflows can stall when downstream services fail to acknowledge a transition, when conflicting transactions consume available funds, or when a prior step times out without advancing. These are not GL Publisher issues -- they live in the money movement / BOR Inflight layer.
- **How common**: 11 of 49 EOC tickets in the week of Feb 2-6, 2026 alone were stuck/stalled transactions (~22%). Internal transfer issues were the top theme the week of Jan 26-30. Running mtasks to advance stuck state machines accounted for ~25% of all EOC resolutions in that period.
- **What to do**:
  1. Identify the stuck state from the EOC ticket or Atlas (e.g., `pending_reservation`, `pending_execution`)
  2. Run the appropriate **mtask** to manually advance or cancel the stuck transaction
  3. If the stuck state is `posting` and involves an internal transfer, check whether a conflicting withdrawal consumed the funds (see EOC-150827 -- conflicting withdrawal required cancellation instead of advancing)
  4. If the issue is on the BOR Inflight side, redirect to `#bor-inflight-oncall`
  5. For recurring stuck states on the same transaction type, flag it to the team -- it may indicate a systemic issue
- **Real example**: EOC-151034 -- Asset movement stalled in `pending_execution` state. Resolved by running mtask to unstick. EOC-150687 -- Stalled in `pending_balance_service_sync`, also resolved via mtask.
- **Pro tip**: Stuck state machines are different from stuck GL imports (type #4). GL imports are Oracle-side; state machines are application-side. If the transaction never made it to GL Publisher, it is a state machine problem. Check `so-orders` and the money movement pipeline first.

### 12. Monthly Fee Posting Lag
- **What it looks like**: Massive Kafka consumer lag on the first business day of the month. Sentry noise spikes. GL Publisher dashboards show a wall of pending activities. You might also see lending activity volumes that dwarf normal days.
- **Why it happens**: Management fee posting runs on the first business day of each month, flooding GL Publisher with 700k+ fee-related messages in a short window. Lending activity spikes compound the load -- Sebastian Craig reported 1.7MM lending activities on Feb 2, 2026 (Thread #156), calling it "the largest one I recall seeing." The system is designed to handle it, but the sheer volume pushes latency up and triggers monitors.
- **How common**: Happens every single month, guaranteed. The week of Feb 2 had 24 Slack threads -- the highest in the entire 90-day dataset -- and this volume spike is a major contributor.
- **What to do**:
  1. **Do not panic.** This is expected. The system will work through the backlog.
  2. Monitor Kafka lag on `gl-publisher-tx-ingress-stream` -- it will be high, but it should be trending downward over hours, not growing indefinitely.
  3. Watch for anything that gets **stuck** rather than just slow. If specific activity types stop advancing entirely, that is a real problem.
  4. If lag is still growing after 4-6 hours, check pod health, Oracle connectivity, and whether any activities are in an error state.
  5. Keep an eye on the DLQ -- fee posting errors can cause a higher-than-normal DLQ trickle.
- **Real example**: Thread #156 (Feb 2, 2026) -- Sebastian Craig: "1.7MM Lending activities today. This is the largest one I recall seeing -- we'll likely need to revisit this monitor soon." The team monitored but no intervention was needed.
- **Pro tip**: If you are on-call and the first business day of the month falls on your shift, block off extra monitoring time in the morning. You will not need to do anything most months, but you need to be watching in case this is the month something actually breaks under load.

### 13. Oracle Tablespace / SYS.FGA_LOG$ Full
- **What it looks like**: Sentry alerts from oracle-gl-publisher with ORA-01653 errors ("unable to extend table SYS.FGA_LOG$ in tablespace SYSTEM"). GL Publisher posting starts failing across the board. This is different from the usual ORA- connection errors -- it means Oracle has run out of space.
- **Why it happens**: Oracle's Fine Grained Auditing (FGA) log table `SYS.FGA_LOG$` grows over time as audit records accumulate. When the SYSTEM tablespace fills up, Oracle cannot write new audit entries and starts rejecting operations. This is an Oracle DBA problem, not a GL Publisher problem.
- **How common**: Rare but high-impact. Thread #155 (Feb 3, 2026) showed PJ flagging this via a Sentry alert from oracle-gl-publisher. When it happens, it blocks all GL posting until resolved.
- **What to do**:
  1. **Escalate to #oracle-support immediately.** This is not something BOR Write can fix. The Oracle DBA team needs to either purge old FGA_LOG$ records or extend the SYSTEM tablespace.
  2. While waiting for the DBA team, monitor the DLQ -- activities will start piling up there since they cannot post.
  3. Do NOT retry DLQ entries until the tablespace issue is resolved. Retrying will just fail again and add noise.
  4. Once the DBA confirms the tablespace is cleared, retry the DLQ entries and monitor for successful posting.
  5. Check `GL_INTERFACE` for any records that partially wrote before the failure.
- **Real example**: Thread #155 (Feb 3, 2026) -- PJ shared a Sentry alert link to #oracle-support for an ORA-01653 error affecting oracle-gl-publisher. The error pointed to `SYS.FGA_LOG$` in the SYSTEM tablespace.
- **Pro tip**: This is one of the few Oracle errors where "wait and see" is the wrong approach. ORA-01653 on a system tablespace will not auto-recover. Escalate fast. The faster the DBA team acts, the smaller the DLQ backlog you have to clean up afterward.

### 14. FLAMB Reversal Request Routing
- **What it looks like**: A FLAMB ticket arrives but it is not a straightforward reversal you should action yourself. It might be an internal transfer reversal, a manually-booked transaction, an EFT deposit to a registered account, or a request that does not actually belong on the FLAMB board at all.
- **Why it happens**: CX ops agents and other teams do not always know which board to use. Internal transfer reversals used to be FLAMB's responsibility but have since moved to BOPSIT (ops can now self-serve via Ledge). Manual transaction reversals require BOSM. Some tickets are not even reversal requests -- they are arbitrary booking requests or transfer executions (see FLAMB-256, FLAMB-98).
- **How common**: A significant portion of FLAMB tickets need routing rather than direct action. The FLAMB/EOC guidelines document identifies 6 common redirect categories. FLAMB-110 was mis-routed from BOPSIT, FLAMB-98 was a transfer execution request (not a reversal), and FLAMB-256 was a rebooking request that had to be rejected outright.
- **What to do**:
  1. Check the 3 ground rules from Estelle before processing any reversal: (a) the error was made by WS after clear client instruction, (b) the funds are still in the destination account, (c) the client is aware of CRA implications for registered accounts.
  2. **Internal transfer reversal (non-fraud)?** Redirect to BOPSIT. Ops can self-serve via Ledge Activity Reversal tool.
  3. **Manually posted transaction?** Redirect to BOSM. BOR Write cannot reverse manually-booked entries.
  4. **EFT deposit reversal to TFSA/RRSP?** Redirect to BOPSFUND to avoid contribution room impact.
  5. **Managed account involved?** Check if a PMO ticket is needed first.
  6. **Not a reversal at all?** Reject with explanation. FLAMB is for reversals and corrections only.
  7. **ATO fraud?** This one you DO action. See type #9 above.
- **Real example**: BOPSIT-139752 -- ATO confirmed, fraudulent internal transfer of $1,200.44 reversed. Required coordination across FFR-53821 (fraud tracking), BOPSIT (internal transfer reversal), and FLAMB (ledger correction confirmation). FLAMB-110 -- CXA cut a BOPSIT ticket instead of BOSM and did not specify backdating, requiring re-routing.
- **Pro tip**: When in doubt about whether to action or redirect, check the idempotency key format. If it starts with `internal_transfer-` or `asset_movement_request-` or `it-`, it is an internal transfer -- redirect to BOPSIT (unless it is ATO fraud). If the transaction was not posted through GL Publisher, you cannot reverse it in Ledge anyway.

### 15. Graceful Shutdown / Deploy Disruptions
- **What it looks like**: Sentry errors or alert bursts that coincide exactly with a deploy to oracle-gl-publisher or related services. The errors appear for a few minutes, then stop. Common patterns include import failures, brief Oracle connectivity blips, or Kafka consumer rebalancing errors timed perfectly with the deploy window.
- **Why it happens**: When a pod shuts down during a deploy, in-flight operations (Oracle imports, Kafka message processing) can fail if the application does not handle graceful shutdown properly. Missing or incomplete `SmartLifecycle` hook implementations mean the app does not drain its work queue before the JVM exits. Jun Kim identified in Thread #142 that "the SmartLifecycle implementation may need an additional override" for GL Publisher. Thread #149 (Feb 3, 2026) showed Sebastian Craig confirming errors that coincided with a deploy, with Ahmed and the team investigating.
- **How common**: Deploy-related alerts account for 18 Slack threads (11.2%) overall, and a subset of those are specifically these transient shutdown-related errors rather than bugs introduced by the new code. Thread #149 is a clear example where the errors mapped directly to the deploy timing and were not caused by the code change itself.
- **What to do**:
  1. **Correlate with deploy timing.** Check if a deploy happened in the last 5-10 minutes. If yes, wait 10-15 minutes -- the errors may be purely transient.
  2. If errors stop after the new pods stabilize, confirm it was a deploy disruption and note it in the thread.
  3. If errors persist beyond 15 minutes, it is NOT a graceful shutdown issue -- treat it as a real deploy-caused bug (see type #7).
  4. Check for GL records that may have been partially processed during shutdown -- they might need reimporting.
  5. Monitor the DLQ for any activities that landed there during the disruption window.
- **Real example**: Thread #149 (Feb 3, 2026) -- Sebastian Craig noted errors "coincides with a deploy." Ahmed Uqaili and the team investigated. Thread #142 -- Jun Kim identified that the SmartLifecycle implementation in GL Publisher may need additional overrides to handle shutdown more gracefully.
- **Pro tip**: These are distinct from type #7 (deploy-related alerts from actual bugs). The key differentiator is duration: graceful shutdown issues resolve in minutes once the new pods are healthy. If you see this pattern repeatedly on deploys, flag it to the team -- it is a sign that the `SmartLifecycle` hooks need improvement. This is tracked as a known gap.

---

## Seasonal Patterns

**First business day of the month**: Fee posting day. GL Publisher processes a massive volume of fee-related activities. The system has handled 700k+ messages on these days. Expect higher Kafka lag, slower processing, and more Sentry noise. Mostly just be extra vigilant -- the system handles it, but watch for anything that gets stuck.

**Weekends**: Generally quieter, but misconfigured alerts can fire. Thread #4 in the data -- "this is known and should be fixed when Ryan's changes hit prod soon." If an alert fires on a weekend and looks like something you have seen auto-resolve, give it 30 minutes before panicking.

**Lending activity spikes**: 1.7MM messages have been seen during peak lending activity. Similar to fee posting -- volume goes up, latency goes up, but the system is designed to handle it. Watch for outliers.

**Holiday periods (late Dec, early Jan)**: The data shows a significant drop -- 5 threads the week of Dec 22, 4 threads the week of Dec 29, compared to 20+ threads in surrounding weeks. Fewer deploys, fewer ops requests, but still watch for Oracle issues.

**Early February spike**: 24 threads the week of Feb 2 -- the highest in the dataset. Likely correlated with new year financial activity catching up. Be prepared for a busy start to the month.

---

## The People You'll Work With

Based on who shows up in Slack threads and how:

| Person | Role in On-Call Context | Threads |
|--------|------------------------|---------|
| **Jun Kim** | Go-to for GL Publisher, idempotency key questions, deep investigation. Most active responder. | 46 |
| **Sebastian Craig** | Ledger expert. Confirms ledger state, advises on reversals, pairs on complex EOC investigations. | 41 |
| **Gordon Wood** | Deep-dive investigations, pairs on tricky EOC tickets (e.g., unledgered orders). | 23 |
| **Seneli** | On-call rotation peer. Coordinates on deploys, investigates Ledge issues. | 17 |
| **PJ** | On-call rotation peer. Consulted on deploy/redeploy decisions, Ledge connectivity issues. | 11 |
| **Yvonne** | Code fixes, PR reviews related to alerts. | 14 |
| **Ahmed Uqaili** | Quick to offer help during alert storms. | 12 |
| **Estelle / Roshan** | Approval for non-fraud reversals. Escalation point for ambiguous FLAMB cases. | -- |
| **Sheri (backup: Kwaw)** | Approves MF recon table updates. | -- |

**Automated posters**: pganalyze (13 threads) and Preset Alerts and Reports (13 threads) post automated messages. These are monitoring signals, not people.

---

## Quick Decision Trees

### "I see a Sentry alert in #bor-write-alerts"
```
Is it an Oracle ORA- error?
  YES --> Is there an ongoing Oracle maintenance window?
           YES --> Monitor. It should resolve.
           NO  --> Is it a credential error (ORA-01017)?
                    YES --> Check if xxbrk user is locked.
                    NO  --> Wait 15 min. Still happening? Check GL Publisher logs.
  NO --> Is it a Ledge "Connection not available" error?
          YES --> Redeploy Ledge.
          NO  --> Is it GL Publisher related?
                   YES --> Check Kafka lag, check DLQ, check activity statuses.
                   NO  --> Read the error. Check the service. Ask in #bor-write-oncall.
```

### "A new FLAMB ticket arrived"
```
Does it have a custodian account ID and idempotency key?
  NO  --> Comment asking for the info. Wait.
  YES --> Is it an internal transfer reversal (non-fraud)?
           YES --> Redirect to BOPSIT.
           NO  --> Is it ATO fraud?
                    YES --> Verify FRAUD ticket says "Confirmed Suspicious."
                            Reverse via Ledge. 3 business day SLA.
                    NO  --> Is it a manual transaction reversal?
                             YES --> Redirect to BOSM.
                             NO  --> Investigate. Label. Reverse via Ledge or escalate.
```

### "Something is in the DLQ"
```
BrokerSideSettlement or PTM?
  YES --> CryptoBrokerageSettlement? Ping #wscrypto-oncall. Otherwise ignore for 1 day.
Card reward payout (CASHBACK)?
  YES --> Ignore completely.
Safe-to-archive pattern? (see runbook)
  YES --> Archive.
JDBC timeout (not ManualJournal)?
  YES --> Retry.
ManualJournal?
  YES --> Do NOT retry. Investigate first.
Everything else --> Investigate before retrying.
```

### "EOC ticket: Account not synced to Oracle"
```
Is it a corporate account?
  YES --> Try backend sync. If that fails, open BOAO ticket.
Is it a margin account?
  YES --> Check if margin account type is set in Oracle. Coordinate with BOAO for conflicts.
Standard personal account?
  YES --> Manual backend sync. If BART ownership conflict, escalate to BOAO.
AIAgent already errored?
  YES --> Expected. Do the manual sync yourself.
```

---

## Things That Are Safe to Ignore

- **BrokerSideSettlement/PTM DLQ entries** (for 1 business day) -- PTM manages their own
- **Card reward payout DLQ entries** (card-reward-payout- + CASHBACK) -- payment-cards team handles these
- **CryptoBrokerageStakingPoolReward with "Quantity cannot be 0"** -- Safe to archive
- **brokerage_settlement- with "Security Delta must be greater than 0"** -- Safe to archive
- **MoneyMovement with "No active security for..."** -- Safe to archive
- **AdministrativePayments/Writeoffs prefixed with ManualCharge-** -- Safe to archive
- **"Unauthorized" transaction claims** -- Nearly all resolve by checking audit logs (client's own profile/device initiated it). See the Jan 26-30 weekly summary: every single one was client-initiated.
- **Book value discrepancies between Atlas and mobile that are very recent** -- Can be transient; verify before acting (EOC-149493)
- **LaunchDarkly timeout during deploy** -- Flags use last-known state from cache. Not usually critical. Thread #11 showed this happening.
- **pganalyze and Preset automated posts** -- These are monitoring signals. Read them, but they do not require immediate action unless they show something abnormal.

---

## Red Flags: When to Escalate Immediately

**Wake people up for these:**

- **GL Publisher completely stopped processing** -- Growing Kafka lag + no activities advancing. This was an actual incident (RI-3889) where ~8,000 unposted orders threatened reconciliation. Ping the team immediately.
- **Oracle `xxbrk` user locked out** -- Nothing posts to GL until this is fixed. Escalate to Oracle DBA team.
- **Mass DLQ accumulation** -- If dozens of entries are appearing in minutes (not the usual trickle), something systemic is wrong.
- **HikariCP pool exhaustion across ALL Ledge pods simultaneously** -- One pod is normal (redeploy it). All pods means Oracle itself is the problem.
- **Any issue blocking first-business-day-of-month fee posting** -- This is time-sensitive. 700k+ messages need to process.

**Can wait until morning:**

- A handful of DLQ entries from a single activity type (investigate during business hours)
- Sentry errors that are firing but GL Publisher is still processing normally
- "Account not synced to Oracle" -- These are not urgent. The auto-BOAO ticket process handles it.
- A single stuck GL import batch (check it, but if nothing else is blocked, it can wait)
- Book value correction requests (these are never urgent)

---

*Based on 161 Slack threads, ~100 EOC tickets, and dozens of FLAMB tickets from Nov 2025 - Feb 2026. Last updated: 2026-02-13.*
