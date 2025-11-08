# DATABASE SETUP GUIDE

## PostgreSQL Installation

### macOS (using Homebrew)
```bash
# Install PostgreSQL
brew install postgresql@15

# Start PostgreSQL service
brew services start postgresql@15

# Verify installation
psql --version
```

### Ubuntu/Debian
```bash
# Install PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify installation
psql --version
```

### Windows
1. Download PostgreSQL installer from https://www.postgresql.org/download/windows/
2. Run the installer and follow the setup wizard
3. Remember the password you set for the postgres user

## Database Setup

### 1. Create Database and User

```bash
# Connect to PostgreSQL as superuser
psql postgres

# Or on Linux:
sudo -u postgres psql
```

Then run these SQL commands:

```sql
-- Create database
CREATE DATABASE xahpayroll;

-- Create user
CREATE USER xahpayroll_user WITH ENCRYPTED PASSWORD 'your_secure_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE xahpayroll TO xahpayroll_user;

-- Connect to the database
\c xahpayroll

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO xahpayroll_user;

-- Exit psql
\q
```

### 2. Configure Environment Variables

Copy the `.env.example` file to `.env`:

```bash
cd backend
cp .env.example .env
```

Edit `.env` and update the database configuration:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=xahpayroll
DB_USER=xahpayroll_user
DB_PASSWORD=your_secure_password
```

### 3. Initialize Database Schema

The database schema will be automatically created when you start the backend server for the first time. The server will:

1. Check if the `users` table exists
2. If not, create all tables from `database/schema.sql`
3. Set up indexes and triggers

```bash
npm run dev
```

You should see:
```
🔄 Initializing database...
📋 Creating database tables...
✅ Database tables created successfully
✅ Connected to PostgreSQL database
🚀 XAH Payroll Backend running on port 3001
💾 Database: xahpayroll on localhost
```

## Database Schema

### Users Table

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    organization_name VARCHAR(255),
    email VARCHAR(255),
    phone_number VARCHAR(50),
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('employee', 'ngo', 'employer')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Sessions Table (for future use)

```sql
CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    wallet_address VARCHAR(100) NOT NULL,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Useful PostgreSQL Commands

### Connect to Database
```bash
psql -U xahpayroll_user -d xahpayroll
```

### List All Databases
```sql
\l
```

### List All Tables
```sql
\dt
```

### Describe Table Structure
```sql
\d users
```

### View All Users
```sql
SELECT * FROM users;
```

### Count Users by Type
```sql
SELECT user_type, COUNT(*) FROM users GROUP BY user_type;
```

### Delete All Users (CAUTION!)
```sql
DELETE FROM users;
```

### Drop and Recreate Database (CAUTION!)
```sql
-- Connect as superuser
DROP DATABASE xahpayroll;
CREATE DATABASE xahpayroll;
GRANT ALL PRIVILEGES ON DATABASE xahpayroll TO xahpayroll_user;
```

## Backup and Restore

### Backup Database
```bash
pg_dump -U xahpayroll_user xahpayroll > backup.sql
```

### Restore Database
```bash
psql -U xahpayroll_user xahpayroll < backup.sql
```

## Troubleshooting

### Connection Refused
- Check if PostgreSQL is running: `brew services list` (macOS) or `sudo systemctl status postgresql` (Linux)
- Verify port 5432 is not blocked by firewall
- Check `pg_hba.conf` for authentication settings

### Permission Denied
- Ensure user has proper privileges
- Run the GRANT commands again
- Check if you're connecting to the correct database

### Password Authentication Failed
- Verify password in `.env` matches the one set in PostgreSQL
- Check `pg_hba.conf` authentication method (should be `md5` or `scram-sha-256`)

### Table Already Exists Error
- The schema will only create tables if they don't exist
- If you need to recreate tables, drop them first or drop the entire database

## Production Considerations

### Security
1. **Use strong passwords** - Generate with: `openssl rand -base64 32`
2. **Enable SSL/TLS** - Configure PostgreSQL to require SSL connections
3. **Restrict access** - Use firewall rules to limit database access
4. **Regular backups** - Set up automated backup schedule
5. **Monitor connections** - Track active connections and slow queries

### Performance
1. **Connection pooling** - Already configured in `db.js` (max 20 connections)
2. **Indexes** - Schema includes indexes on frequently queried columns
3. **Query optimization** - Monitor slow queries with `EXPLAIN ANALYZE`
4. **Regular maintenance** - Run `VACUUM` and `ANALYZE` periodically

### Scaling
1. **Read replicas** - Set up read replicas for high-traffic applications
2. **Connection pooling** - Use PgBouncer for better connection management
3. **Monitoring** - Use tools like pg_stat_statements for query analysis
4. **Partitioning** - Consider table partitioning for large datasets

## Migration to Production Database

When moving to production, consider using managed database services:

- **AWS RDS for PostgreSQL**
- **Google Cloud SQL**
- **Azure Database for PostgreSQL**
- **DigitalOcean Managed Databases**
- **Heroku Postgres**

These services provide:
- Automated backups
- High availability
- Automatic failover
- Monitoring and alerts
- Easy scaling

Update your `.env` with the production database credentials provided by your hosting service.

## Support

For PostgreSQL documentation: https://www.postgresql.org/docs/

For issues specific to XAH Payroll database setup, please open an issue on GitHub.
