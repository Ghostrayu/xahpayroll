# Evernode Deployment Guide

Minimalistic checklist for deploying XAH Payroll to Evernode.

## Prerequisites

- [ ] Xahau wallet with EVR tokens
- [ ] Docker installed locally
- [ ] PostgreSQL database (external: Supabase/AWS RDS OR decentralized: OrbitDB/IPFS backups)

## 1. Prepare Application

- [ ] Create `Dockerfile` in `backend/` directory
- [ ] Build Docker image: `docker build -t xahpayroll-backend backend/`
- [ ] Export image: `docker save xahpayroll-backend | gzip > xahpayroll.tar.gz`
- [ ] Build frontend: `cd frontend && npm run build`

## 2. Lease Evernode Instance

- [ ] Install Evernode SDK: `npm install evernode-js-client`
- [ ] Connect wallet to Evernode marketplace
- [ ] Lease instance (single or 3+ for cluster)
- [ ] Note instance IP and credentials

## 3. Deploy Backend

- [ ] Upload image: `scp xahpayroll.tar.gz user@instance-ip:/app/`
- [ ] SSH into instance: `ssh user@instance-ip`
- [ ] Load image: `docker load < xahpayroll.tar.gz`
- [ ] Create `.env` file with database credentials
- [ ] Run container:
  ```bash
  docker run -d --name xahpayroll --env-file .env -p 3001:3001 --restart unless-stopped xahpayroll-backend
  ```
- [ ] Verify: `curl http://localhost:3001/health`

## 4. Deploy Frontend

**Option A: CDN (Hybrid)**
- [ ] Deploy to Netlify: `npm run deploy`
- [ ] Set `VITE_BACKEND_URL=https://api.yourdomain.com`

**Option B: IPFS (Decentralized)**
- [ ] Upload build to IPFS: `npx ipfs-deploy frontend/dist/`
- [ ] Register ENS domain (e.g., `xahpayroll.eth`)
- [ ] Point domain to IPFS CID

## 5. Configure DNS

- [ ] Point domain A record to Evernode instance IP
- [ ] Configure SSL/TLS (Let's Encrypt or Cloudflare)

## 6. Full Decentralization (Optional)

**Option A: OrbitDB**
- [ ] Install: `npm install orbit-db ipfs`
- [ ] Replace PostgreSQL queries with OrbitDB document store
- [ ] Deploy to 3+ Evernode instances with replication

**Option B: PostgreSQL + IPFS Backups**
- [ ] Run PostgreSQL container on Evernode instances
- [ ] Implement backup script (pg_dump → IPFS every 15min)
- [ ] Store IPFS CID on XRPL ledger (memo field)
- [ ] Implement restore on instance startup

**Option C: HotPocket Consensus**
- [ ] Install: `npm install hotpocket-nodejs-contract`
- [ ] Convert API routes to HotPocket smart contracts
- [ ] Deploy to 3+ instances with consensus

## 7. Monitoring

- [ ] Set up uptime monitoring (endpoint: `/health`)
- [ ] Monitor EVR balance for lease renewal
- [ ] Configure log access: `docker logs -f xahpayroll`

## Quick Deploy Commands

```bash
# Build
docker build -t xahpayroll-backend backend/
docker save xahpayroll-backend | gzip > xahpayroll.tar.gz

# Upload
scp xahpayroll.tar.gz user@instance-ip:/app/
scp backend/.env user@instance-ip:/app/

# Deploy
ssh user@instance-ip
docker load < xahpayroll.tar.gz
docker run -d --name xahpayroll --env-file .env -p 3001:3001 xahpayroll-backend

# Verify
curl http://localhost:3001/health
```

## Resources

- [Evernode Docs](https://docs.evernode.org)
- [HotPocket Contracts](https://github.com/EvernodeXRPL/everpocket-nodejs-contract)
- [OrbitDB Docs](https://github.com/orbitdb/orbit-db)
- [IPFS Docs](https://docs.ipfs.tech/)

## Architecture Options

**Hybrid** (Faster, Lower Cost):
- Backend → Evernode
- Database → Supabase
- Frontend → Netlify

**Fully Decentralized** (Censorship-Resistant):
- Backend → Evernode (3+ instances with HotPocket)
- Database → OrbitDB or PostgreSQL + IPFS backups
- Frontend → IPFS + ENS domain
