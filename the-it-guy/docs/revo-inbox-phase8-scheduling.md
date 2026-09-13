# Revo inbox — phase 8 automated-sync readiness

Phase 8 adds the safe scheduling state required before automatic imports are
enabled: a configurable interval, next eligible time, and a bounded lease that
prevents overlapping syncs for the same mailbox.

No cron job is configured by this phase. Enabling scheduled provider reads is
a production decision and requires a protected scheduler credential, deployed
Edge Function, monitoring, retry limits, and a confirmed Revo consent model.
