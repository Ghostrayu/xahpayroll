# XAH Payroll Database Setup Checklist

Complete step-by-step checklist to set up the PostgreSQL database for XAH Payroll system.

---

## Prerequisites Checklist

- [x] PostgreSQL 14+ installed
- [x] Command line access (Terminal/PowerShell)
- [x] Admin/superuser access to PostgreSQL

---

## Step 1: Install PostgreSQL

- [x] **Install PostgreSQL on your system**

### macOS
```bash
# Using Homebrew
brew install postgresql@14
brew services start postgresql@14
```

### Ubuntu/Debian
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Windows
Download and install from: https://www.postgresql.org/download/windows/

---

## Step 2: Access PostgreSQL

- [x] **Connect to PostgreSQL**

```bash
# macOS/Linux
psql postgres

# Or if you need sudo
sudo -u postgres psql

# Windows (use pgAdmin or)
psql -U postgres
```

---

## Step 3: Create Database and User

- [x] **Create database `xahpayroll_dev`**
- [x] **Create user `xahpayroll_user`**
- [x] **Grant privileges to user**
- [x] **Test connection**

```sql
-- Create the database
CREATE DATABASE xahpayroll_dev;

-- Create a dedicated user
CREATE USER xahpayroll_user WITH ENCRYPTED PASSWORD 'your_secure_password_here';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE xahpayroll_dev TO xahpayroll_user;

-- Connect to the new database
\c xahpayroll_dev

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO xahpayroll_user;

-- Exit
\q
```

---

## Step 4: Connect as New User

- [x] **Test connection with new user credentials**

```bash
# Test connection
psql -U xahpayroll_user -d xahpayroll_dev -h localhost

# You should see:
# xahpayroll_dev=>
```

---

## Step 5: Create Tables (In Order)

- [x] **Create all 10 tables in the correct order**

### 5.1 Create Users Table (FIRST)

- [x] **Create `users` table**

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(64) UNIQUE NOT NULL,
  user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('employee', 'employer', 'ngo', 'admin')),
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  profile_data JSONB
);

-- Add comment
COMMENT ON TABLE users IS 'Core user accounts identified by XAH wallet addresses';
```

### 5.2 Create Organizations Table

- [x] **Create `organizations` table**

```sql
CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  organization_name VARCHAR(255) NOT NULL,
  organization_type VARCHAR(50) CHECK (organization_type IN ('ngo', 'company', 'individual')),
  registration_number VARCHAR(100),
  country VARCHAR(100),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  escrow_wallet_address VARCHAR(64) UNIQUE NOT NULL,
  escrow_balance DECIMAL(20, 8) DEFAULT 0,
  total_workers INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE organizations IS 'NGOs and employers who hire workers';
```

### 5.3 Create Employees Table

- [x] **Create `employees` table**

```sql
CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  full_name VARCHAR(255),
  employee_wallet_address VARCHAR(64) NOT NULL,
  hourly_rate DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'XAH',
  employment_status VARCHAR(20) DEFAULT 'active' CHECK (employment_status IN ('active', 'inactive', 'terminated')),
  hire_date DATE DEFAULT CURRENT_DATE,
  termination_date DATE,
  total_hours_worked DECIMAL(10, 2) DEFAULT 0,
  total_earnings DECIMAL(20, 8) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id, employee_wallet_address)
);

COMMENT ON TABLE employees IS 'Workers employed by organizations';
```

### 5.4 Create Work Sessions Table

- [x] **Create `work_sessions` table**

```sql
CREATE TABLE work_sessions (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  clock_in TIMESTAMP NOT NULL,
  clock_out TIMESTAMP,
  hours_worked DECIMAL(5, 2),
  hourly_rate DECIMAL(10, 2) NOT NULL,
  total_amount DECIMAL(20, 8),
  session_status VARCHAR(20) DEFAULT 'active' CHECK (session_status IN ('active', 'completed', 'timeout', 'cancelled')),
  timeout_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE work_sessions IS 'Individual work shifts with clock in/out times';
```

### 5.5 Create Payments Table

- [x] **Create `payments` table**

```sql
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES work_sessions(id) ON DELETE SET NULL,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  amount DECIMAL(20, 8) NOT NULL,
  currency VARCHAR(10) DEFAULT 'XAH',
  payment_type VARCHAR(20) CHECK (payment_type IN ('hourly', 'bonus', 'adjustment', 'refund')),
  tx_hash VARCHAR(128) UNIQUE,
  from_wallet VARCHAR(64) NOT NULL,
  to_wallet VARCHAR(64) NOT NULL,
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  payment_channel_id VARCHAR(128),
  hook_verification_hash VARCHAR(128),
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE payments IS 'All payment transactions from escrow to workers';
```

### 5.6 Create Escrow Transactions Table

- [x] **Create `escrow_transactions` table**

```sql
CREATE TABLE escrow_transactions (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20) CHECK (transaction_type IN ('deposit', 'withdrawal', 'payment', 'refund')),
  amount DECIMAL(20, 8) NOT NULL,
  balance_before DECIMAL(20, 8) NOT NULL,
  balance_after DECIMAL(20, 8) NOT NULL,
  tx_hash VARCHAR(128),
  wallet_address VARCHAR(64),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE escrow_transactions IS 'Audit trail of all escrow account movements';
```

### 5.7 Create Payment Configurations Table

- [x] **Create `payment_configurations` table**

```sql
CREATE TABLE payment_configurations (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  timeout_threshold_minutes INTEGER DEFAULT 60,
  payment_frequency_minutes INTEGER DEFAULT 60,
  auto_payment_enabled BOOLEAN DEFAULT true,
  require_manual_approval BOOLEAN DEFAULT false,
  minimum_session_minutes INTEGER DEFAULT 15,
  grace_period_minutes INTEGER DEFAULT 5,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id)
);

COMMENT ON TABLE payment_configurations IS 'Customizable payment rules per organization';
```

### 5.8 Create Activity Logs Table

- [x] **Create `activity_logs` table**

```sql
CREATE TABLE activity_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  action_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INTEGER,
  description TEXT,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE activity_logs IS 'Audit trail of all user actions';
```

### 5.9 Create Notifications Table

- [x] **Create `notifications` table**

```sql
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  action_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE notifications IS 'User notifications for important events';
```

### 5.10 Create API Keys Table (Optional)

- [x] **Create `api_keys` table** (optional)

```sql
CREATE TABLE api_keys (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  key_hash VARCHAR(255) UNIQUE NOT NULL,
  key_name VARCHAR(100),
  permissions JSONB,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE api_keys IS 'API keys for programmatic access';
```

---

## Step 6: Create Indexes (Performance Optimization)

- [x] **Create all indexes for performance**

```sql
-- Users indexes
CREATE INDEX idx_users_wallet ON users(wallet_address);
CREATE INDEX idx_users_type ON users(user_type);
CREATE INDEX idx_users_active ON users(is_active);

-- Organizations indexes
CREATE INDEX idx_organizations_user ON organizations(user_id);
CREATE INDEX idx_organizations_escrow ON organizations(escrow_wallet_address);
CREATE INDEX idx_organizations_status ON organizations(status);

-- Employees indexes
CREATE INDEX idx_employees_org ON employees(organization_id);
CREATE INDEX idx_employees_user ON employees(user_id);
CREATE INDEX idx_employees_wallet ON employees(employee_wallet_address);
CREATE INDEX idx_employees_status ON employees(employment_status);

-- Work sessions indexes
CREATE INDEX idx_sessions_employee ON work_sessions(employee_id);
CREATE INDEX idx_sessions_org ON work_sessions(organization_id);
CREATE INDEX idx_sessions_status ON work_sessions(session_status);
CREATE INDEX idx_sessions_clock_in ON work_sessions(clock_in);
CREATE INDEX idx_sessions_created ON work_sessions(created_at);

-- Payments indexes
CREATE INDEX idx_payments_employee ON payments(employee_id);
CREATE INDEX idx_payments_org ON payments(organization_id);
CREATE INDEX idx_payments_session ON payments(session_id);
CREATE INDEX idx_payments_tx ON payments(tx_hash);
CREATE INDEX idx_payments_status ON payments(payment_status);
CREATE INDEX idx_payments_created ON payments(created_at);

-- Escrow transactions indexes
CREATE INDEX idx_escrow_org ON escrow_transactions(organization_id);
CREATE INDEX idx_escrow_type ON escrow_transactions(transaction_type);
CREATE INDEX idx_escrow_created ON escrow_transactions(created_at);

-- Activity logs indexes
CREATE INDEX idx_logs_user ON activity_logs(user_id);
CREATE INDEX idx_logs_org ON activity_logs(organization_id);
CREATE INDEX idx_logs_action ON activity_logs(action_type);
CREATE INDEX idx_logs_created ON activity_logs(created_at);

-- Notifications indexes
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at);
```

---

## Step 7: Create Helper Functions

- [x] **Create helper functions and triggers**

### 7.1 Update Timestamp Function

- [x] **Create `update_updated_at_column()` function**

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';
```

### 7.2 Add Triggers for Auto-Update

- [x] **Add triggers to tables**

```sql
-- Organizations
CREATE TRIGGER update_organizations_updated_at 
BEFORE UPDATE ON organizations 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Employees
CREATE TRIGGER update_employees_updated_at 
BEFORE UPDATE ON employees 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Work sessions
CREATE TRIGGER update_sessions_updated_at 
BEFORE UPDATE ON work_sessions 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Payment configurations
CREATE TRIGGER update_payment_configs_updated_at 
BEFORE UPDATE ON payment_configurations 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## Step 8: Insert Sample Data (Testing)

- [x] **Insert sample data for testing**

### 8.1 Create Test NGO

- [x] **Create test NGO user and organization**

```sql
-- Insert NGO user
INSERT INTO users (wallet_address, user_type, email) 
VALUES ('rNGO1TestWallet123456789', 'ngo', 'ngo@example.com')
RETURNING id;
-- Note the returned id (e.g., 1)

-- Insert organization
INSERT INTO organizations (
  user_id, 
  organization_name, 
  organization_type,
  escrow_wallet_address,
  escrow_balance
) VALUES (
  1, -- Use the id from above
  'Test NGO',
  'ngo',
  'rEscrowTestWallet123456789',
  10000.00
);
```

### 8.2 Create Test Employee

- [x] **Create test employee user and record**

```sql
-- Insert employee user
INSERT INTO users (wallet_address, user_type, email) 
VALUES ('rWorker1TestWallet123456789', 'employee', 'worker@example.com')
RETURNING id;
-- Note the returned id (e.g., 2)

-- Insert employee
INSERT INTO employees (
  user_id,
  organization_id,
  full_name,
  employee_wallet_address,
  hourly_rate
) VALUES (
  2, -- Use the id from above
  1, -- Organization id
  'John Doe',
  'rWorker1TestWallet123456789',
  15.00
);
```

### 8.3 Create Payment Configuration

- [x] **Create payment configuration for test org**

```sql
INSERT INTO payment_configurations (
  organization_id,
  timeout_threshold_minutes,
  payment_frequency_minutes,
  auto_payment_enabled
) VALUES (
  1,
  60,
  60,
  true
);
```

---

## Step 9: Verify Setup

- [x] **Verify all tables exist**
- [x] **Check sample data**
- [x] **Run test queries**

```sql
-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Count records in each table
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'organizations', COUNT(*) FROM organizations
UNION ALL
SELECT 'employees', COUNT(*) FROM employees
UNION ALL
SELECT 'work_sessions', COUNT(*) FROM work_sessions
UNION ALL
SELECT 'payments', COUNT(*) FROM payments;

-- Test query: Get organization with employees
SELECT 
  o.organization_name,
  o.escrow_balance,
  COUNT(e.id) as employee_count
FROM organizations o
LEFT JOIN employees e ON o.id = e.organization_id
GROUP BY o.id;
```

---

## Step 10: Create Database Backup

- [ ] **Create initial database backup** (Optional - do this when ready)

```bash
# Create backup
pg_dump -U xahpayroll_user -d xahpayroll_dev -F c -b -v -f xahpayroll_backup.dump

# Restore from backup (if needed)
pg_restore -U xahpayroll_user -d xahpayroll_dev -v xahpayroll_backup.dump
```

---

## Step 11: Environment Variables

- [x] **Create `.env` file with database credentials**

Create a `.env` file in your backend directory:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=xahpayroll_dev
DB_USER=xahpayroll_user
DB_PASSWORD=your_secure_password_here

# Database URL (alternative format)
DATABASE_URL=postgresql://xahpayroll_user:your_secure_password_here@localhost:5432/xahpayroll_dev

# Connection Pool Settings
DB_POOL_MIN=2
DB_POOL_MAX=10
```

---

## Step 12: Test Connection from Node.js

- [x] **Test database connection from Node.js**

Create a test file `test-db.js`:

```javascript
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Database connected successfully!');
    
    const result = await client.query('SELECT NOW()');
    console.log('Current time from DB:', result.rows[0].now);
    
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('\n📋 Tables in database:');
    tables.rows.forEach(row => console.log('  -', row.table_name));
    
    client.release();
    await pool.end();
  } catch (err) {
    console.error('❌ Database connection error:', err);
  }
}

testConnection();
```

Run it:
```bash
npm install pg dotenv
node test-db.js
```

---

## Troubleshooting

### Connection Refused
```bash
# Check if PostgreSQL is running
# macOS
brew services list

# Linux
sudo systemctl status postgresql

# Start if not running
brew services start postgresql@14  # macOS
sudo systemctl start postgresql    # Linux
```

### Permission Denied
```sql
-- Grant all privileges again
\c xahpayroll_dev
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO xahpayroll_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO xahpayroll_user;
```

### Can't Connect from Node.js
```bash
# Check PostgreSQL is accepting connections
sudo nano /etc/postgresql/14/main/postgresql.conf
# Ensure: listen_addresses = 'localhost'

sudo nano /etc/postgresql/14/main/pg_hba.conf
# Add: host    all    all    127.0.0.1/32    md5

# Restart PostgreSQL
sudo systemctl restart postgresql
```

---

## Next Steps

1. ✅ Database is set up
2. 📝 Create backend API (Express.js)
3. 🔐 Implement authentication
4. 🔄 Build CRUD operations
5. ⚡ Connect to XRPL
6. 🧪 Write tests

---

## Production Setup

For production, use:
- **Managed PostgreSQL** (AWS RDS, DigitalOcean, Heroku)
- **Connection pooling** (PgBouncer)
- **Automated backups**
- **SSL connections**
- **Read replicas** for scaling

---

## Summary

You now have:
- ✅ PostgreSQL database created
- ✅ 10 tables with relationships
- ✅ Indexes for performance
- ✅ Sample data for testing
- ✅ Backup capability
- ✅ Ready for backend integration

Database is ready to track users, organizations, employees, work sessions, and payments! 🚀
