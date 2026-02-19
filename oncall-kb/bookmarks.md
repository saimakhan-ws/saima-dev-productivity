# BOR Write On-Call Bookmarks & Quick Links

A consolidated reference of all links used during on-call for the BOR Write team, extracted from the BOR Write On-Call Handbook.

---

## Dashboards - Oracle GL Publisher

- [Queue-Processor](https://app.datadoghq.com/dashboard/ut6-9qx-8xn/bor-oracle-gl-publisher-queueprocessor) -- Monitors the SQS queue consumption pipeline
- [Batched-Activities-Processor](https://app.datadoghq.com/dashboard/6yx-v6r-3f3/bor-oracle-gl-publisher-batched-activities-processor) -- Tracks processing of batched activity messages
- [Grouped-Activities-Processor](https://app.datadoghq.com/dashboard/ug5-hg3-83y) -- Tracks processing of grouped activity messages
- [API & Audit-Status-Processor](https://app.datadoghq.com/dashboard/qey-2gh-8dc/bor-oracle-gl-publisher-api-audit-processor) -- API health and audit status processing metrics
- [Job](https://app.datadoghq.com/dashboard/yj8-mj6-uhj) -- Scheduled job execution and status
- [System & Hardware](https://app.datadoghq.com/dashboard/2ab-j69-39j/bor-oracle-gl-publisher-system) -- CPU, memory, disk, and other infrastructure metrics
- [Client & Downstream](https://app.datadoghq.com/dashboard/jdc-f8t-6fn) -- Health of downstream dependencies and client interactions
- [Legacy GL Publisher Dashboard](https://app.datadoghq.com/dashboard/bkq-7rr-msd/bor-oracle-gl-publisher) -- Older consolidated dashboard (may still be referenced)

## Monitoring & Error Tracking

- [Sentry: GL Publisher](https://wealthsimple-org.sentry.io/projects/oracle-gl-publisher/?project=4506304878149632) -- Application error tracking and exception details
- [Datadog Monitors for GL Publisher](https://app.datadoghq.com/monitors/manage?q=service%3A%22oracle-gl-publisher%22&order=desc) -- All active monitors for the GL Publisher service
- [Unposted GL_INTERFACE monitor](https://app.datadoghq.com/monitors/140973006) -- Alerts when records are stuck unposted in Oracle's GL_INTERFACE table

## Tools

- [Atlas DLQ (Dead Letter Queue) Tool](https://atlas.wealthsimple.com/tools/gl_publisher_dlq) -- UI for inspecting and replaying failed messages from the dead letter queue
- [Ledge (Prod)](https://ledge.wealthsimple.com/) -- Production Ledge UI for looking up accounts, activities, and balances
- [Ledge (Staging)](https://ledge.cac1.ws2.staging.w10e.com/) -- Staging Ledge UI for testing
- [Rundeck GL Publisher](https://rundeck.iad.w10e.com/project/Deployments-Production/job/show/638ba5aa-35ca-499c-a2b8-addc6d0197b8) -- Job runner for GL Publisher operational tasks in production

## Preset Dashboards (Redshift/Pantheon)

- [Failed & Stuck GL transactions](https://8a26d867.wealthsimple-aws-mpc.app.preset.io/superset/dashboard/2116/) -- Overview of GL transactions that failed or are stuck in the pipeline
- [Stuck GL Publisher Imports](https://8a26d867.wealthsimple-aws-mpc.app.preset.io/superset/dashboard/p/Ko0mZQLa1A7/) -- Records stuck during the GL Publisher import stage
- [Failed Imports in GL Interface](https://8a26d867.wealthsimple-aws-mpc.app.preset.io/explore/?dashboard_page_id=Ae2iC4h02A&slice_id=28856) -- Records that failed to import into Oracle's GL_INTERFACE table
- [Stuck Records (Other Sources)](https://8a26d867.wealthsimple-aws-mpc.app.preset.io/explore/?dashboard_page_id=Ae2iC4h02A&slice_id=32098) -- Stuck records originating from non-GL-Publisher sources
- [Failed Records (Not GL Publisher)](https://8a26d867.wealthsimple-aws-mpc.app.preset.io/explore/?dashboard_page_id=Ae2iC4h02A&slice_id=28883) -- Failed records originating from non-GL-Publisher sources

## Jira Boards

- [EOC: WRITE OnCall Board](https://wealthsimple.atlassian.net/jira/software/c/projects/EOC/boards/996/) -- Primary board for tracking on-call tickets during your rotation
- [EOC: All BOR](https://wealthsimple.atlassian.net/jira/software/c/projects/EOC/boards/301) -- All BOR on-call tickets across teams
- [FLAMB Board](https://wealthsimple.atlassian.net/jira/software/projects/FLAMB/boards/849) -- FLAMB (Finance, Ledger, Accounting, Mutual Funds, Billing) project board
- [Failed/Stuck tracking epic](https://wealthsimple.atlassian.net/browse/WRITE-2038) -- Epic for tracking recurring failed/stuck GL transaction issues
- [Mutual fund / manual-correction dashboard](https://wealthsimple.atlassian.net/jira/dashboards/10407) -- Tracks mutual fund issues and manual correction requests
- [Reversal labels dashboard](https://wealthsimple.atlassian.net/jira/dashboards/10428) -- Tracks reversal label requests and status

## Jira Boards - Ticket Routing

Use these boards to route tickets to the correct team when they are not BOR Write issues.

- [BOTI (Transfers In)](https://wealthsimple.atlassian.net/jira/software/c/projects/BOTI/boards/259) -- Inbound asset/cash transfers
- [BOTO (Transfers Out)](https://wealthsimple.atlassian.net/jira/software/c/projects/BOTO/boards/222) -- Outbound asset/cash transfers
- [BOPSIT (Internal Transfers)](https://wealthsimple.atlassian.net/jira/software/c/projects/BOPSIT/boards/247) -- Transfers between Wealthsimple accounts
- [BOSM (Mickey Brown)](https://wealthsimple.atlassian.net/jira/software/c/projects/BOSM/boards/209) -- Settlement and market operations
- [Data Delivery Requests](https://wealthsimple.atlassian.net/servicedesk/customer/portal/13/group/28/create/133) -- Service desk portal for data delivery requests

## Slack Channels

| Channel | Slack ID | Purpose |
|---------|----------|---------|
| #bor-write-alerts | C017AUU0N2Y | Primary alert channel -- monitor this during on-call |
| #bor-write-on-call | C0175002067 | Team discussion and coordination during on-call |
| #oracle-support | C9X5JUH0V | Oracle-related support and escalation |
| #bor-write-eng | C016VB1JT4M | General BOR Write engineering discussion |
| #fee-file | CKXGD82HX | Monthly fee posting coordination |
| #bor-write-alerts-staging | C08J209KE2K | Staging environment alerts (non-critical) |
| #cxo-technical-support | -- | CX Ops technical support requests |
| #ledger-execution-eng | -- | Ledger execution engineering team |
| #ptm-oncall | -- | Post-trade management on-call (BrokerSideSettlement issues) |
| #wscrypto-oncall | C02UQFWMQTD | Crypto brokerage settlement on-call |
| #payment-cards | -- | Card rewards DLQ issues |

## Notion Docs

- [BOR Write On-Call Handbook](https://www.notion.so/wealthsimple/BOR-Write-On-Call-Handbook-4563585ccca84762b94166058d9a1c96) -- The primary on-call reference (source of this bookmarks file)
- [On-Call HOWTOs](https://www.notion.so/5e19786b1c4c4538927de20faf9e32ad) -- Step-by-step guides for common on-call tasks
- [Handling Alerts](https://www.notion.so/wealthsimple/Handling-Alerts-675c80596eb549f5b6cec9600f8fc566) -- How to triage and respond to each alert type
- [Inventory of Oracle transaction sources](https://www.notion.so/wealthsimple/Inventory-of-Oracle-transactions-sources-10b9e553499a4d599d745e3596f24e7c) -- Reference of all systems that publish transactions to Oracle
- [Reversing Activities In The Ledger](https://www.notion.so/wealthsimple/Reversing-Activities-In-The-Ledger-1fd0ef8add4e4b5f8ebeea04b78d3bc9) -- How to reverse ledger entries when corrections are needed
- [FLAMB Scenarios](https://www.notion.so/14441167bd968094a9ccc52a5bbef343) -- Common FLAMB ticket scenarios and how to handle them
- [FLAMB/EOC Guidelines](https://www.notion.so/1a141167bd96807d8415fdfc2090a873) -- Guidelines for triaging FLAMB and EOC tickets
- [FLAMB tickets for ATO remediation](https://www.notion.so/67cf48d1155040ca8596817219a89c56) -- Handling Account Takeover remediation via FLAMB
- [BOR Write On-Call Initial Setup](https://www.notion.so/8a4f447eb8e24c23ade60fa7e463d3db) -- First-time setup steps before your first on-call rotation
- [Incident Management Process](https://www.notion.so/wealthsimple/7abf75b48c2b4e1caa9935c9d413a1a8) -- How to declare, manage, and close incidents
- [How to Impersonate a User](https://www.notion.so/wealthsimple/c1c12f784e3e434eb93dc85d67eef05b) -- Steps to impersonate a user for debugging (requires appropriate permissions)

## GitHub

- [GL Publisher repo](https://github.com/wealthsimple/oracle-gl-publisher) -- Main application repository
- [Ledge repo](https://github.com/wealthsimple/ledge) -- Ledger service repository
- [GL Publisher Dependabot PRs](https://github.com/wealthsimple/oracle-gl-publisher/pulls/app%2Fdependabot) -- Open dependency update PRs for GL Publisher
- [Ledge Dependabot PRs](https://github.com/wealthsimple/ledge/pulls/app%2Fdependabot) -- Open dependency update PRs for Ledge
- [GL Publisher Combine PRs Workflow](https://github.com/wealthsimple/oracle-gl-publisher/actions/workflows/combine-prs.yml) -- GitHub Action to batch multiple Dependabot PRs into one
- [Ledge Combine PRs Workflow](https://github.com/wealthsimple/ledge/actions/workflows/combine-prs.yml) -- GitHub Action to batch multiple Dependabot PRs into one

## Other

- [Oracle error codes doc](https://docs.google.com/document/d/1NBzW9SGCuRw4nmkUsmo5kTFm99SUMTOG-t91uiD8L7U/edit#bookmark=id.2jxsxqh) -- Reference for interpreting Oracle error codes seen in GL Publisher logs
- [How To Internal Transfer Reversals](https://docs.google.com/document/d/1tEw1QxCE6d71xQtugITTcKsbbCJvvj5D6DOmLh3I014/edit?tab=t.0) -- Step-by-step guide for reversing internal transfers

## Datadog Log Search Templates

- [GL Publisher error logs (production)](https://app.datadoghq.com/logs?query=service%3Aoracle-gl-publisher%20%40appenv%3Aproduction%20status%3Aerror&live=true) — All error-level logs from GL Publisher prod
- [GL Publisher failed imports](https://app.datadoghq.com/logs?query=service%3Aoracle-gl-publisher%20%40appenv%3Aproduction%20status%3Aerror%20%22Import%20failed%22&live=true) — Activities that failed Oracle GL import (EF04, etc.)
- [Search by idempotency key (template)](https://app.datadoghq.com/logs?query=service%3Aoracle-gl-publisher%20%40appenv%3Aproduction%20%40idempotency_key%3AREPLACE_KEY_HERE&live=true) — Replace REPLACE_KEY_HERE with the actual key
- [ImportCheckService scheduled job logs](https://app.datadoghq.com/logs?query=service%3Aoracle-gl-publisher%20%40appenv%3Aproduction%20%22Scheduled%20Import%20Job%20Running%22&live=true) — Verify ImportCheckService is running

## Oracle Health Dashboards

- [Oracle Status (main)](https://app.datadoghq.com/dashboard/2ct-x2w-ckj/oracle-status) — Active sessions, physical reads, ASM disk space
- [Oracle Concurrent Managers](https://app.datadoghq.com/dashboard/5bv-qni-bpt) — Running/pending import jobs (if backed up, imports are stuck)
- [Oracle EBS XXBRK Jobs](https://app.datadoghq.com/dashboard/mv8-r7r-xd7) — Pending pricing, funding, dividends jobs
- [Oracle TWS2E (prod DB)](https://app.datadoghq.com/dashboard/pxt-dfm-rba) — Host CPU, disk, posted/unposted batches
- [Oracle Prod Instances](https://app.datadoghq.com/dashboard/44z-9yf-usq) — CPU, memory, disk for sws1e hosts

## Import Check Monitors

- [Activity failed in GL_INTERFACE (prod)](https://app.datadoghq.com/monitors/252144447) — Fires when any activity has import error
- [ImportCheckService not running (prod)](https://app.datadoghq.com/monitors/118892874) — Heartbeat monitor for the scheduled job
- [Imports processing slowly (prod)](https://app.datadoghq.com/monitors/123025527) — Oldest import > 2 hours = critical
- [ImportCheckService running slowly (prod)](https://app.datadoghq.com/monitors/127895213) — p95 batch duration > 120s

## Oracle Error Monitors (alert to #oracle-support)

- [ORA-1631 Max extents in table](https://app.datadoghq.com/monitors/108489269)
- [ORA-1632 Max extents in index](https://app.datadoghq.com/monitors/156872643)
- [ORA-1630 Max extents in temp tablespace](https://app.datadoghq.com/monitors/108489266)
- [ORA-1654 Unable to extend index](https://app.datadoghq.com/monitors/108489261)
- [ORA-01555 Snapshot too old](https://app.datadoghq.com/monitors/108489259)
