# Production observability runbook

Prometheus scrapes API, Worker, PostgreSQL exporter, Garage, and Loki through
the private Compose network. Grafana provisions Prometheus and Loki read-only
datasources. Alertmanager routes availability, security, backup, and
replication alerts to `oncall-prod`. Promtail sends Docker logs to Loki with
redaction rules for secrets, cookies, authorization, employee identifiers, and
database URLs.

The alert receiver URL, Grafana password, log storage volume, retention owner,
and external notification credentials are host-only production inputs. A
passing config test or an unconnected receiver is not delivered-alert evidence.

For every incident record the alert timestamp, first acknowledgement, recovery
timestamp, affected host, request/error counts, replication/WAL/backup lag, and
the resulting availability/RPO/RTO measurement. Keep logs for at least 30 days
unless the approved retention policy requires longer.
