# Ledge

## What It Does

Ledge is the internal back-office web application that replaces Oracle Forms for ledger and accounting operations. It provides 33 UI forms for account inquiry, manual journal entry, reversals, order management, and fee administration. Finance and operations teams use it daily for GL-related tasks.

## Tech Stack

| Component       | Detail                                |
|-----------------|---------------------------------------|
| Language        | Kotlin                                |
| UI Framework    | Vaadin (server-side rendered)         |
| Backend         | Spring Boot 3.x                       |
| Build           | Gradle (multi-module)                 |
| Auth            | Okta                                  |
| Feature Flags   | LaunchDarkly                          |
| App Database    | PostgreSQL (metadata)                 |
| Legacy Database | Oracle EBS (multi-datasource)         |
| Workflows       | Temporal                              |
| Team            | BOR Write (@bor-write-prs)            |

## Key Modules (3)

| Module              | Purpose                                                          |
|---------------------|------------------------------------------------------------------|
| **forms**           | Main Vaadin application. Contains all 33 UI forms, 89 service classes, 60+ entity models. This is where nearly all code lives. |
| **db**              | Liquibase database migrations for PostgreSQL.                    |
| **temporal-worker** | Temporal workflow workers for async operations (e.g., batch processing, long-running jobs). |

## External Dependencies

| Service | How Ledge Uses It |
|---------|-------------------|
| **GL Publisher** | GraphQL queries for GL records, statuses, and posting data |
| **Account Service** | Account lookups and validation |
| **Accounting Flink Jobs** | Streaming aggregation data |
| **Auth (Okta)** | User authentication and role-based access |
| **Forex** | FX rate lookups |
| **Fort Knox** | Settlement and custody operations |
| **SO Orders** | Order data queries |
| **FAM** | Fund accounting integration |
| **Temporal** | Async workflow orchestration |
| **Kafka** | Event publishing |
| **Redshift** | Analytical queries and reporting |
| **S3** | File storage (reports, exports) |
| **Jira** | Ticket creation from approval workflows |
| **Slack** | Notifications for approvals and alerts |

## Kafka Topics

Ledge primarily publishes to GL Publisher audit topics (see oracle-gl-publisher.md for full list). It does not have its own dedicated ingress topics.

## Database

### PostgreSQL (Metadata)
Key entities:

- **Request** -- Audit trail with multi-level approval workflow
  - Statuses: `PENDING_APPROVAL_1` -> `PENDING_APPROVAL_2` -> `PROCESSING` -> `COMPLETE` or `REJECTED` / `FAILED`
- **Account** -- Cached account metadata
- **GlRecord** -- Local GL record references

### Oracle EBS (Multi-Datasource)
Three Oracle datasource configurations with failover:

| Datasource | Purpose |
|------------|---------|
| **TWS2E** | Primary Oracle EBS connection |
| **SWS1E** | Secondary Oracle EBS connection |
| **SWS2E** | Tertiary Oracle EBS connection |

Each datasource has its own HikariCP connection pool.

## Common Failure Modes

| Failure | Symptoms | Resolution |
|---------|----------|------------|
| **HikariCP connection pool exhaustion** | Requests hang or timeout, "Connection is not available" errors in logs | **Redeploy the affected pod(s).** This is the most common issue. Pool size is 20 connections per datasource. Long-running Oracle queries or connection leaks cause it. |
| **Oracle datasource failover** | One Oracle connection failing, app partially working | Check which datasource is down. Failover should be automatic but verify in logs. |
| **Vaadin session desync** | UI errors, blank pages, or stale data after pod restart | User needs to hard-refresh browser (Ctrl+Shift+R). Sticky sessions mean a pod restart drops that user's session. |
| **Sticky session routing failure** | Users see inconsistent state, form submissions fail | Check that session affinity is configured correctly on the ingress. Each user must hit the same pod. |
| **Okta auth failures** | Users cannot log in | Check Okta status page. Verify Okta config hasn't changed. |
| **GL Publisher GraphQL timeout** | Account inquiry or GL lookups are slow/failing | Check GL Publisher health. Ledge depends heavily on it for GL data. |
| **LaunchDarkly outage** | Feature flags stuck, new features not toggling | Flags will use last-known state from local cache. Not usually critical. |

## Key Metrics & Dashboards

| Metric | What to Watch |
|--------|--------------|
| **HTTP request latency** | p99 above 5s indicates Oracle or GL Publisher issues |
| **HikariCP active connections** | Approaching 20 per datasource = imminent pool exhaustion |
| **HikariCP pending requests** | Any sustained pending requests = pool is saturated |
| **Pod restarts** | Vaadin is stateful; restarts disrupt active users |
| **Oracle query duration** | Slow queries cause cascading pool exhaustion |
| **Request approval queue depth** | Build-up means approvers aren't processing |
| **Error rate by form** | Identifies which specific form is problematic |

## URLs

| Environment | URL |
|-------------|-----|
| **Production** | https://ledge.wealthsimple.com/ |
| **Staging** | https://ledge.cac1.ws2.staging.w10e.com/ |

## Useful Commands & Queries

```sql
-- Check requests stuck in processing
SELECT id, request_type, status, created_at, updated_at
FROM request
WHERE status = 'PROCESSING'
  AND updated_at < NOW() - INTERVAL '1 hour'
ORDER BY created_at;

-- Count requests by status (last 24h)
SELECT status, COUNT(*)
FROM request
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status
ORDER BY COUNT(*) DESC;

-- Check HikariCP pool state (from actuator if exposed)
-- GET /actuator/health or /actuator/metrics/hikaricp.connections.active
```

```bash
# Check pod logs for connection pool issues
kubectl logs -l app=ledge --tail=500 | grep -i "connection is not available"

# Check pod logs for Oracle errors
kubectl logs -l app=ledge --tail=500 | grep -i "ORA-"

# Quick check: are all pods healthy?
kubectl get pods -l app=ledge

# Run ktlint before pushing (CI will fail otherwise)
./gradlew :forms:ktlintCheck
# Auto-fix violations:
./gradlew :forms:ktlintFormat
```

## Deployment

```bash
# Deploy to staging
ws deploy -a ledge -e staging -b <branch>

# Deploy to production
ws deploy -a ledge -e production -b main

# Sandbox (for development/testing)
ws sandbox create

# Rollback: redeploy previous known-good commit
ws deploy -a ledge -e production -b <previous-sha>
```

**Important deployment notes:**
- Vaadin is **stateful** -- deployments will terminate active user sessions on restarted pods
- **Sticky sessions** (session affinity) are required. Verify ingress config after any infra changes.
- Deploy during low-usage windows when possible (outside business hours)
- If deploying to fix HikariCP exhaustion, a rolling restart is sufficient -- no code change needed
