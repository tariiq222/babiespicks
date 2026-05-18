# Runbook: Database Down

**Severity:** P0  
**Service:** PostgreSQL (via SSH tunnel in dev, direct in prod)  
**Health check:** `GET https://api.babiespicks.com/health` → `"database": "error"`

---

## Symptoms

- `GET /health` returns `{"database": "error"}`
- API returns 500 errors on any data-fetching endpoint
- GlitchTip shows `PrismaClientKnownRequestError` or `PrismaClientInitializationError` spikes
- Logs show: `Database connection failed` or `connect ECONNREFUSED`

---

## Diagnosis Steps

### 1. Confirm database is the issue
```bash
curl https://api.babiespicks.com/health
# Expect: {"database":"error"} if DB is down
```

### 2. Check the health endpoint logs in Dokploy
Look for repeated connection errors in the API container log.

### 3. In dev — check SSH tunnel
The local dev environment requires an SSH tunnel to the remote PostgreSQL:
```bash
# Check if tunnel is running
ps aux | grep "ssh -f -N -L 5433"

# Restart tunnel if dead
ssh -f -N -L 5433:localhost:54320 deqah

# Verify tunnel is working
psql -h localhost -p 5433 -U <DB_USER> -d <DB_NAME> -c "SELECT 1"
```

### 4. In prod — check PostgreSQL process on the server
```bash
# SSH into server
ssh deqah

# Check PostgreSQL status
systemctl status postgresql
# or
pg_lsclusters

# Check if PostgreSQL is listening
ss -tlnp | grep 5432
```

### 5. Check connection string
Verify `DATABASE_URL` in `apps/api/.env` or Dokploy environment variables is correct:
```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
```

### 6. Check connection pool exhaustion
```bash
# On the PostgreSQL server
psql -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"
psql -c "SHOW max_connections;"
```

---

## Resolution Steps

### If tunnel is dead (dev)
```bash
ssh -f -N -L 5433:localhost:54320 deqah
# Wait 5 seconds, then verify
curl http://localhost:3001/health
```

### If PostgreSQL service is stopped (prod)
```bash
ssh deqah
sudo systemctl start postgresql
sudo systemctl status postgresql
```

### If PostgreSQL is running but rejecting connections
Check `pg_hba.conf` for authentication issues:
```bash
sudo nano /etc/postgresql/*/main/pg_hba.conf
# Verify the app's IP/subnet is allowed
sudo systemctl reload postgresql
```

### If connection pool is exhausted
Restart the API service in Dokploy to release stale connections:
1. Go to Dokploy dashboard
2. Navigate to the `babiespicks-api` service
3. Click **Restart**
4. Monitor logs for successful reconnection

### If DATABASE_URL is wrong
1. Go to Dokploy → babiespicks-api → Environment Variables
2. Correct `DATABASE_URL`
3. Redeploy the service

---

## Rollback Procedure

If a recent schema migration caused the issue:

1. **Do NOT run `prisma migrate reset`** — this drops all data.
2. Identify the last working migration:
   ```bash
   cd apps/api
   pnpm exec prisma migrate status
   ```
3. Manually revert the problematic SQL change by writing a new corrective migration.
4. Deploy the corrective migration:
   ```bash
   pnpm exec prisma migrate deploy
   ```

---

## Post-Incident

- Check if any requests were lost during the outage (check GlitchTip for queued failures)
- Verify the AI pipeline resumes automatically (check CronModule logs)
- File a P0 post-incident review within 48 hours (see [incident-response.md](./incident-response.md))
