# Database Diagnostic Reference

**Quick reference for database diagnostics and troubleshooting**

## Database Configuration

**Environment**: Development
**Database Name**: `xahpayroll_dev`
**User**: `xahpayroll_user`
**Password**: `xahpayroll_secure_2024`
**Host**: `localhost`
**Port**: `5432`

**Environment Variable**: Set in `backend/.env`
```bash
DB_NAME=xahpayroll_dev
```

## Connection Architecture

**3-Tier Fallback System** (`backend/database/db.js:7`):
```javascript
database: process.env.DB_NAME || 'xahpayroll'
```

**Priority**:
1. **Primary**: Value from `DB_NAME` environment variable → `xahpayroll_dev`
2. **Fallback**: Hardcoded default → `xahpayroll` (only if env var missing)
3. **Actual**: Current connection uses `xahpayroll_dev` ✅

## Standard Diagnostic Commands

### Quick Health Check
```bash
PGPASSWORD='xahpayroll_secure_2024' psql -U xahpayroll_user -d xahpayroll_dev -h localhost -p 5432 -c "SELECT version();"
```

### List All Tables
```bash
PGPASSWORD='xahpayroll_secure_2024' psql -U xahpayroll_user -d xahpayroll_dev -h localhost -p 5432 -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
```

### Count Tables
```bash
PGPASSWORD='xahpayroll_secure_2024' psql -U xahpayroll_user -d xahpayroll_dev -h localhost -p 5432 -c "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = 'public';"
```

### Table Row Counts
```bash
PGPASSWORD='xahpayroll_secure_2024' psql -U xahpayroll_user -d xahpayroll_dev -h localhost -p 5432 -c "SELECT 'users' as table_name, COUNT(*) FROM users UNION ALL SELECT 'organizations', COUNT(*) FROM organizations UNION ALL SELECT 'payment_channels', COUNT(*) FROM payment_channels UNION ALL SELECT 'employees', COUNT(*) FROM employees UNION ALL SELECT 'work_sessions', COUNT(*) FROM work_sessions;"
```

### Check Database Size
```bash
PGPASSWORD='xahpayroll_secure_2024' psql -U xahpayroll_user -d xahpayroll_dev -h localhost -p 5432 -c "SELECT pg_size_pretty(pg_database_size('xahpayroll_dev')) as database_size;"
```

### Active Connections
```bash
PGPASSWORD='xahpayroll_secure_2024' psql -U xahpayroll_user -d xahpayroll_dev -h localhost -p 5432 -c "SELECT count(*) as active_connections FROM pg_stat_activity WHERE datname = 'xahpayroll_dev';"
```

## Interactive psql Session

```bash
PGPASSWORD='xahpayroll_secure_2024' psql -U xahpayroll_user -d xahpayroll_dev -h localhost -p 5432
```

**Useful psql commands** (inside interactive session):
- `\dt` - List all tables
- `\d table_name` - Describe table structure
- `\l` - List all databases
- `\du` - List all users/roles
- `\q` - Quit psql session

## Troubleshooting

### "database does not exist" Error

**Check which databases exist**:
```bash
PGPASSWORD='xahpayroll_secure_2024' psql -U xahpayroll_user -h localhost -p 5432 -l | grep xahpayroll
```

**Common causes**:
- Using wrong database name (should be `xahpayroll_dev`, NOT `xahpayroll_db`)
- Database not initialized (run `npm run init-db` from backend directory)
- Wrong environment file loaded

### Connection Refused

**Check PostgreSQL is running**:
```bash
pg_isready -h localhost -p 5432
```

**Check connection parameters**:
```bash
cd backend && node -e "require('dotenv').config(); console.log('DB_NAME:', process.env.DB_NAME, '\nDB_USER:', process.env.DB_USER, '\nDB_HOST:', process.env.DB_HOST);"
```

### Authentication Failed

**Verify credentials in `.env`**:
```bash
cat backend/.env | grep -E "^DB_"
```

**Expected output**:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=xahpayroll_dev
DB_USER=xahpayroll_user
DB_PASSWORD=xahpayroll_secure_2024
```

## Database Schema Information

**Core Tables** (as of 2025-12-11):
- `users` - User accounts and wallet addresses
- `organizations` - NGO/employer organizations
- `employees` - Worker-organization relationships
- `payment_channels` - XAH payment channel records
- `work_sessions` - Clock in/out time tracking
- `payments` - Payment transaction history
- `sessions` - Authentication sessions
- `deletion_logs` - User deletion audit trail
- `ngo_notifications` - Organization notification system

**Migration Files**: `backend/database/migrations/*.sql`

## See Also

- Main documentation: `CLAUDE.md` (Database Diagnostic Commands section)
- Database setup guide: `DATABASE_SETUP.md`
- Setup SQL script: `setup_database.sql`
- Connection code: `backend/database/db.js`
