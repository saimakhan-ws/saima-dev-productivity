# SO-Orders

## What It Does

SO-Orders is the central order management system for all tradeable asset types at Wealthsimple. It handles the full order lifecycle from creation through submission to brokers, fill processing, and GL posting. This is a **Tier-1 critical service** -- outages directly block client trading.

## Tech Stack

| Component       | Detail                                          |
|-----------------|-------------------------------------------------|
| Language        | Java 21 + Kotlin                                |
| Legacy Framework| Dropwizard + Guice                              |
| Modern Framework| Spring Boot 3.5.7                               |
| Build           | Maven (52 modules)                              |
| API             | REST (Dropwizard) + GraphQL (Spring Boot)       |
| Messaging       | Kafka + SQS (FIFO + DLQ) + SNS                  |
| Workflows       | Temporal                                        |
| App Database    | PostgreSQL (`so_orders`)                         |
| Cache           | Redis                                           |
| Integration DB  | Oracle                                          |
| Feature Flags   | LaunchDarkly                                    |

## Key Modules (selected from 52)

| Module                   | Purpose                                                            |
|--------------------------|--------------------------------------------------------------------|
| **orders-api**           | Primary REST API (Dropwizard). Handles order CRUD, submission, cancellation. Legacy but still core. |
| **orders-api-gql**       | Modern GraphQL API (Spring Boot). Newer endpoints and queries live here. |
| **workflows**            | Temporal workflow definitions for order processing, fills, settlements. |
| **order-batch-handler**  | Batch order processing (mutual funds, end-of-day batches).         |
| **order-event-handler**  | Reacts to order lifecycle events from Kafka/SQS.                   |
| **balance-consumer**     | Consumes balance updates for order validation.                     |
| **inventory-consumer**   | Consumes inventory data for position checks.                       |
| **positions-consumer**   | Consumes position updates.                                        |
| **cron-jobs**            | Scheduled tasks (expiry checks, reconciliation, EOD processing).   |
| **order-gl-poster**      | Posts order-related GL entries to GL Publisher.                     |
| **monitors**             | Health checks and monitoring for order processing.                 |

## Supported Asset Types

Equities, Options, Futures, Precious Metals, Crypto, Mutual Funds

## External Dependencies

| Service | How SO-Orders Uses It |
|---------|----------------------|
| **Balance** | Pre-trade balance validation, holds |
| **BOR Gateway** | Broker order routing |
| **Security Master** | Instrument/security lookups |
| **Forex** | FX conversion for cross-currency trades |
| **Crypto** | Crypto order routing and execution |
| **Business Holiday** | Market calendar, trading day validation |
| **FAM** | Fund accounting integration |
| **SGB (Silver Gold Bull)** | External broker for precious metals orders |
| **GL Publisher** | GL posting for order-related accounting entries |
| **Temporal** | Workflow orchestration |
| **Redis** | Caching (security data, rate limits, idempotency) |
| **SNS (Panko)** | Push notifications to clients |

## Kafka Topics

SO-Orders produces and consumes across many Kafka topics. Key categories:

| Category | Direction | Examples |
|----------|-----------|---------|
| **Order events** | Produce | Order created, submitted, filled, cancelled |
| **Balance updates** | Consume | Balance holds, releases |
| **Inventory updates** | Consume | Position changes |
| **GL posting** | Produce | Entries sent to GL Publisher ingress |
| **Fill events** | Both | Fill received from broker, fill processed |

## SQS Queues

| Queue | Purpose |
|-------|---------|
| **Order processing (FIFO)** | Ensures ordered processing of order state transitions |
| **DLQ** | Dead-letter queue for failed order processing messages |

## Database

### PostgreSQL (`so_orders`)
Core entities and order lifecycle:

- **AbstractOrder** -- Base order entity with subtypes per asset class
  - Lifecycle: `PENDING` -> `SUBMITTED` -> `FILLED` -> `POSTED` (or `CANCELLED` / `REJECTED`)
- **OrderBatch** -- Groups of orders processed together (e.g., mutual fund batches)
- **OrderFill** -- Fill records from broker execution
- **OrderSubmission** -- Tracks submission attempts to brokers

### Redis
- Security/instrument cache
- Idempotency keys
- Rate limiting state

### Oracle (Integration)
- Read-only integration for legacy data access

## Common Failure Modes

| Failure | Symptoms | Resolution |
|---------|----------|------------|
| **Order stuck in PENDING** | Orders not advancing to SUBMITTED | Check Temporal workflows. Likely a downstream dependency (Balance, BOR Gateway) is down. |
| **Order stuck in SUBMITTED** | No fills coming back from broker | Check broker connectivity (BOR Gateway). For precious metals, check SGB integration. |
| **SQS DLQ accumulation** | Messages in dead-letter queue growing | Inspect DLQ messages for error cause. Common: malformed events, missing security data. Replay after fixing. |
| **Balance service timeout** | Order creation fails with balance check errors | Check Balance service health. Orders will fail pre-trade validation. |
| **Redis connection failure** | Increased latency, cache misses, potential duplicate processing | Check Redis cluster health. Service degrades but should continue with DB fallback for most operations. |
| **Kafka consumer lag** | Event processing falling behind, stale data | Check consumer group lag. May need to scale consumers or investigate slow processing in specific handlers. |
| **Temporal workflow failure** | Orders stuck mid-lifecycle, workflow errors in logs | Check Temporal UI for failed workflows. May need manual intervention to advance or cancel stuck orders. |
| **Crypto broker timeout** | Crypto orders failing | Check crypto service health. May affect only crypto asset type while others continue. |
| **Mutual fund batch failure** | Batch orders not processing | Check order-batch-handler logs. Often timing-related (must run within market windows). |
| **GL posting failure** | Orders filled but not posted to GL | Check order-gl-poster logs and GL Publisher health. Financial reporting impacted but trading continues. |

## Key Metrics & Dashboards

| Metric | What to Watch |
|--------|--------------|
| **Order creation rate** | Sudden drops indicate upstream issues or service problems |
| **Order fill latency** | Time from submission to fill -- broker performance indicator |
| **Orders by status** | Abnormal counts in PENDING or SUBMITTED = stuck orders |
| **SQS DLQ depth** | Any growth needs investigation |
| **Kafka consumer lag** | Per consumer group, per topic |
| **API latency (p99)** | REST and GraphQL endpoints |
| **Error rate by asset type** | Isolates problems to specific asset classes |
| **Temporal workflow failure rate** | Workflow errors indicate processing pipeline issues |
| **Redis hit rate** | Drops indicate cache issues |
| **Pod CPU/memory** | 52-module monolith can be resource-hungry |

## Useful Commands & Queries

```sql
-- Orders stuck in non-terminal state for over 1 hour
SELECT id, order_type, status, asset_type, created_at
FROM orders
WHERE status IN ('PENDING', 'SUBMITTED')
  AND created_at < NOW() - INTERVAL '1 hour'
ORDER BY created_at;

-- Order volume by status (last 24h)
SELECT status, COUNT(*)
FROM orders
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status
ORDER BY COUNT(*) DESC;

-- Order volume by asset type (last 24h)
SELECT asset_type, status, COUNT(*)
FROM orders
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY asset_type, status
ORDER BY asset_type, COUNT(*) DESC;

-- Check recent fills
SELECT o.id, o.status, f.fill_price, f.fill_quantity, f.created_at
FROM orders o
JOIN order_fills f ON o.id = f.order_id
WHERE f.created_at > NOW() - INTERVAL '1 hour'
ORDER BY f.created_at DESC
LIMIT 50;

-- Check failed GL postings
SELECT id, order_id, status, error_message, created_at
FROM order_gl_postings
WHERE status = 'FAILED'
  AND created_at > NOW() - INTERVAL '24 hours';
```

```bash
# Check SQS DLQ depth
aws sqs get-queue-attributes --queue-url <dlq-url> --attribute-names ApproximateNumberOfMessages

# Check Kafka consumer lag
kafka-consumer-groups --bootstrap-server <broker> --group so-orders-event-handler --describe

# Check pod health
kubectl get pods -l app=so-orders

# Check pod logs for errors
kubectl logs -l app=so-orders --tail=500 | grep -i error

# Check Temporal workflows
# Use Temporal UI or:
tctl workflow list --query "WorkflowType='OrderProcessingWorkflow' AND ExecutionStatus='Running'"
```

## Deployment

```bash
# Deploy to staging
ws deploy -a so-orders -e staging -b <branch>

# Deploy to production
ws deploy -a so-orders -e production -b main

# Rollback: redeploy previous known-good commit
ws deploy -a so-orders -e production -b <previous-sha>
```

**Important deployment notes:**
- **Tier-1 service** -- deploy during low-traffic windows, never during market hours if avoidable
- 52-module monolith means builds are slow; plan accordingly
- Dropwizard (legacy) and Spring Boot (modern) coexist -- changes may affect one or both runtimes
- SQS FIFO queues ensure ordering -- a stuck consumer blocks the entire queue for that message group
- Coordinate with BOR team if changes affect broker integration
- Feature flags (LaunchDarkly) are heavily used -- prefer flag-guarded rollouts for risky changes
