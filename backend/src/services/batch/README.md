# Batch scan

Multi-message upload + summary view logic for `POST /api/batch-scan`. Calls
the shared pipeline supplied by the route for each message. Do not reimplement
analysis logic here; this module only validates, schedules, and summarizes work.
