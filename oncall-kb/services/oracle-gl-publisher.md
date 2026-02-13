# Oracle GL Publisher

## What It Does

Oracle GL Publisher consumes business activity events from Kafka, transforms them into Oracle General Ledger journal entries, and posts them to the Oracle GL_INTERFACE table. It is the bridge between Wealthsimple's event-driven transaction system and Oracle EBS financial reporting. All financial activity that needs to appear in the general ledger flows through this service.

## Tech Stack

| Component       | Detail                          |
|-----------------|---------------------------------|
| Language        | Kotlin 2.3.0                    |
| Framework       | Spring Boot 3.5.7               |
| Build           | Maven (multi-module)            |
| API             | GraphQL                         |
| Messaging       | Kafka                           |
| App Database    | PostgreSQL                      |
| Ledger Database | Oracle GL (EBS)                 |
| Team            | BOR Write (@bor-write-prs)      |

## Key Modules (7)

| Module                         | Purpose                                                                 |
|--------------------------------|-------------------------------------------------------------------------|
| **queue-processor**            | Main engine. Consumes Kafka activities, runs 40+ impact builders to generate GL records. This is where most business logic lives. |
| **api**                        | GraphQL API. Used by Ledge and other internal tools to query GL records and statuses. |
| **grouped-activities-processor** | Processes activities that must be grouped together before GL generation (e.g., batch settlements). |
| **batched-activities-processor** | Handles high-volume activity batching for performance.                  |
| **audit-status-processor**     | Tracks audit status of posted GL entries.                               |
| **db**                         | Database migrations and shared persistence layer.                       |
| **common**                     | Shared models, utilities, constants.                                    |

## External Dependencies

- **Oracle EBS GL** -- Target ledger for all journal entries
- **Kafka** -- Ingress activities and audit routing
- **PostgreSQL** -- Application state, activity tracking
- **Ledge** -- Queries GL Publisher via GraphQL
- **Temporal** -- Workflow orchestration (audit routing)

## Kafka Topics

### Ingress
| Topic | Purpose |
|-------|---------|
| `gl-publisher-tx-ingress-stream` | Main activity ingress. All business events land here. |

### Audit Routing Topics
| Topic | Source System |
|-------|--------------|
| `gl-publisher-audit-fort-knox` | Fort Knox settlements |
| `gl-publisher-audit-broker-settlement` | Broker settlement activities |
| `gl-publisher-audit-oracle-interface` | Oracle interface postings |
| `gl-publisher-audit-temporal-workflow` | Temporal workflow activities |
| `gl-publisher-audit-manual-charges` | Manual charge entries |
| `gl-publisher-audit-ledge` | Ledge-originated entries |
| `gl-publisher-audit-orders` | Order-related GL entries |

### Egress
| Topic | Purpose |
|-------|---------|
| `gl-publisher-tx-audit-lite` | Lightweight audit trail of all processed activities |

## Database

### PostgreSQL (Application)
Key entities and their lifecycle:

- **Activity** -- Ingested from Kafka. Statuses: `NEW` -> `PROCESSING` -> `PROCESSED` or `FAILED`
- **GlRecord** -- Generated GL entry, linked to one or more Activities
- **GlInterfaceRecord** -- Maps directly to Oracle `GL_INTERFACE` table rows

### Oracle GL (Posting Target)
| Table | Purpose |
|-------|---------|
| `GL_INTERFACE` | Staging table where GL Publisher writes entries. Oracle imports pick them up. |
| `GL_JE_BATCHES` | Journal entry batches (created by Oracle import) |
| `GL_JE_HEADERS` | Journal entry headers |
| `GL_JE_LINES` | Individual debit/credit lines |
| `GL_CODE_COMBINATIONS` | Chart of accounts segments |

- **Oracle user:** `xxbrk` (GL writer role)
- **user_id:** `5468` = GL Publisher system user
- **Business units:** `DISC`, `MFDA`, `WPAY`

## Common Failure Modes

| Failure | Symptoms | Resolution |
|---------|----------|------------|
| **Activity stuck in PROCESSING** | Activities not advancing, consumer lag growing | Check queue-processor logs for exceptions. May need to manually transition status in PG. |
| **Oracle connection failure** | GL records created in PG but not posted to GL_INTERFACE | Check Oracle connectivity. Records will retry automatically. Verify `xxbrk` user isn't locked. |
| **Impact builder error** | Specific activity types failing, others succeeding | Check which impact builder is failing in logs. Usually a data issue with the incoming activity. |
| **Kafka consumer lag** | Dashboard shows growing lag on ingress topic | Check pod health, memory. May need to scale up consumers or investigate slow processing. |
| **DLQ accumulation** | Messages landing in dead-letter queue | Use the DLQ tool to inspect and replay. Often caused by malformed or unexpected activity payloads. |
| **Oracle GL_INTERFACE stuck** | Entries written but not imported by Oracle | Not a GL Publisher issue -- escalate to Oracle DBA team. Check `GL_JE_BATCHES` for import errors. |

## Key Metrics & Dashboards

| Dashboard | What to Watch |
|-----------|--------------|
| **Queue-Processor** | Consumer lag, processing rate, error rate, activity status distribution |
| **Batched-Activities** | Batch sizes, processing time, failure rate |
| **Grouped-Activities** | Grouping queue depth, processing latency |
| **API & Audit** | GraphQL request rate/latency, audit topic throughput |
| **Job** | Scheduled job success/failure, runtime duration |
| **System** | CPU, memory, GC pressure, pod restarts |

**DLQ Tool:** https://atlas.wealthsimple.com/tools/gl_publisher_dlq

## Useful Commands & Queries

```sql
-- Check activities stuck in PROCESSING for more than 1 hour
SELECT id, activity_type, status, created_at
FROM activity
WHERE status = 'PROCESSING'
  AND created_at < NOW() - INTERVAL '1 hour'
ORDER BY created_at;

-- Count activities by status (recent)
SELECT status, COUNT(*)
FROM activity
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;

-- Check GL records not yet posted to Oracle
SELECT COUNT(*) FROM gl_interface_record WHERE posted = false;

-- Oracle: Check GL_INTERFACE staging entries from GL Publisher
SELECT COUNT(*), status
FROM gl_interface
WHERE created_by = 5468
  AND creation_date > SYSDATE - 1
GROUP BY status;
```

```bash
# Check Kafka consumer lag
kafka-consumer-groups --bootstrap-server <broker> --group gl-publisher-queue-processor --describe

# Check pod logs for errors
kubectl logs -l app=oracle-gl-publisher --tail=500 | grep -i error
```

## Deployment

```bash
# Deploy to staging
ws deploy -a oracle-gl-publisher -e staging -b <branch>

# Deploy to production (also available via Rundeck)
ws deploy -a oracle-gl-publisher -e production -b main

# Rollback: redeploy previous known-good commit
ws deploy -a oracle-gl-publisher -e production -b <previous-sha>
```

- **Rundeck** is also available for production deployments
- No special pre/post deployment steps required
- Rolling deployment -- zero downtime
- If Kafka consumers need resetting, coordinate with the team before redeploying
