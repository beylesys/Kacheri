# Kacheri Backend Metrics Reference

This document describes all Prometheus metrics exposed by the Kacheri backend at the `/metrics` endpoint.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `METRICS_ENABLED` | `true` | Enable/disable metrics collection |
| `METRICS_PREFIX` | `kacheri` | Prefix for all metric names |
| `LOG_LEVEL` | `info` | Logging level (trace, debug, info, warn, error, fatal) |
| `LOG_PRETTY` | `false` | Enable pretty printing for development |
| `HEALTH_CHECK_TIMEOUT` | `5000` | Timeout for health checks in milliseconds |

## HTTP Metrics

### `kacheri_http_requests_total`
**Type:** Counter
**Labels:** `method`, `route`, `status_code`
**Description:** Total number of HTTP requests processed by the server.

Example queries:
```promql
# Request rate by status code
sum(rate(kacheri_http_requests_total[5m])) by (status_code)

# Error rate (5xx responses)
sum(rate(kacheri_http_requests_total{status_code=~"5.."}[5m])) / sum(rate(kacheri_http_requests_total[5m]))
```

### `kacheri_http_request_duration_seconds`
**Type:** Histogram
**Labels:** `method`, `route`
**Buckets:** 10ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s
**Description:** HTTP request duration in seconds.

Example queries:
```promql
# P95 latency
histogram_quantile(0.95, rate(kacheri_http_request_duration_seconds_bucket[5m]))

# P99 latency by route
histogram_quantile(0.99, rate(kacheri_http_request_duration_seconds_bucket[5m])) by (route)
```

## AI Metrics

### `kacheri_ai_requests_total`
**Type:** Counter
**Labels:** `action`, `provider`, `status`
**Description:** Total number of AI operation requests.

Actions include:
- `compose` - Full document composition
- `rewriteSelection` - Rewrite selected text
- `translate` - Translation operations
- `constrainedRewrite` - Constrained rewriting

Status values:
- `success` - Operation completed successfully
- `error` - Operation failed

Example queries:
```promql
# AI requests per action
sum(rate(kacheri_ai_requests_total[5m])) by (action)

# AI error rate
sum(rate(kacheri_ai_requests_total{status="error"}[5m])) / sum(rate(kacheri_ai_requests_total[5m]))
```

### `kacheri_ai_request_duration_seconds`
**Type:** Histogram
**Labels:** `action`, `provider`
**Buckets:** 500ms, 1s, 2.5s, 5s, 10s, 30s, 60s, 120s
**Description:** AI operation duration in seconds.

Example queries:
```promql
# AI P99 latency
histogram_quantile(0.99, rate(kacheri_ai_request_duration_seconds_bucket[5m]))

# Average AI latency by provider
rate(kacheri_ai_request_duration_seconds_sum[5m]) / rate(kacheri_ai_request_duration_seconds_count[5m])
```

## Export Metrics

### `kacheri_export_requests_total`
**Type:** Counter
**Labels:** `kind`, `status`
**Description:** Total number of document export requests.

Kind values:
- `pdf` - PDF exports
- `docx` - DOCX exports

Example queries:
```promql
# Export success rate
sum(rate(kacheri_export_requests_total{status="success"}[1h])) / sum(rate(kacheri_export_requests_total[1h]))
```

## Verification Metrics

### `kacheri_verification_runs_total`
**Type:** Counter
**Labels:** `status`
**Description:** Total number of proof verification runs.

Status values:
- `pass` - Verification successful
- `fail` - Verification failed (hash mismatch, etc.)
- `miss` - Proof not found

Example queries:
```promql
# Verification success rate
sum(rate(kacheri_verification_runs_total{status="pass"}[1h])) / sum(rate(kacheri_verification_runs_total[1h]))
```

## Connection Metrics

### `kacheri_active_websocket_connections`
**Type:** Gauge
**Description:** Current number of active WebSocket connections.

Example queries:
```promql
# Connection trend
rate(kacheri_active_websocket_connections[5m])
```

## Data Metrics

### `kacheri_documents_total`
**Type:** Gauge
**Description:** Total number of documents in the system.

### `kacheri_proofs_total`
**Type:** Gauge
**Description:** Total number of proofs in the system.

### `kacheri_jobs_total`
**Type:** Gauge
**Labels:** `status`
**Description:** Total number of jobs by status.

Status values:
- `pending` - Jobs waiting to be processed
- `processing` - Jobs currently being processed
- `completed` - Successfully completed jobs
- `failed` - Failed jobs
- `cancelled` - Cancelled jobs

Example queries:
```promql
# Job queue backlog
kacheri_jobs_total{status="pending"}

# Failed job ratio
kacheri_jobs_total{status="failed"} / (kacheri_jobs_total{status="completed"} + kacheri_jobs_total{status="failed"})
```

## Default Node.js Metrics

The `/metrics` endpoint also includes default Node.js metrics from `prom-client`:

- `process_cpu_user_seconds_total` - CPU time spent in user mode
- `process_cpu_system_seconds_total` - CPU time spent in system mode
- `process_resident_memory_bytes` - Resident memory size
- `nodejs_eventloop_lag_seconds` - Event loop lag
- `nodejs_heap_size_total_bytes` - V8 heap total size
- `nodejs_heap_size_used_bytes` - V8 heap used size
- `nodejs_gc_duration_seconds` - GC duration by type

## Health Check Endpoints

### `GET /health`
Returns comprehensive health status including all dependency checks.

Response:
```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "2025-12-30T12:00:00.000Z",
  "version": "0.1.0",
  "uptime": 3600,
  "checks": {
    "database": { "status": "up", "latency": 5 },
    "storage": { "status": "up", "latency": 10 }
  }
}
```

### `GET /health/ready`
Kubernetes readiness probe. Returns 200 if all dependencies are healthy.

### `GET /health/live`
Kubernetes liveness probe. Returns 200 if the service is running.

## Prometheus Scrape Configuration

Add this to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'kacheri-backend'
    static_configs:
      - targets: ['localhost:4000']
    scrape_interval: 15s
    metrics_path: /metrics

  - job_name: 'kacheri-health'
    static_configs:
      - targets: ['localhost:4000']
    scrape_interval: 30s
    metrics_path: /health
```

## Grafana Dashboard

Import the dashboard from `monitoring/dashboards/kacheri-grafana.json` into Grafana.

The dashboard includes panels for:
- Overview metrics (documents, proofs, connections, request rate)
- HTTP request rate and latency
- AI operations and error rates
- Export and verification statistics
- Job queue status

## Alert Rules

See `monitoring/alerts/alert-rules.yml` for Prometheus alert rules covering:
- High AI error rate (> 5%)
- High verification failure rate (> 2%)
- High AI latency (p99 > 5s)
- WebSocket connection drops
- High HTTP error rate
- Job queue backlog
- Service health degradation
