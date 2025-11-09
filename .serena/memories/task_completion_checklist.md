# Task Completion Checklist

When completing any development task, follow this checklist:

## Code Quality
- [ ] Run linter: `npm run lint` (from root or `cd frontend && npm run lint`)
- [ ] Fix any linting errors before committing
- [ ] Format code if backend changes: `cd backend && npm run format`
- [ ] Ensure TypeScript compilation succeeds: `cd frontend && npm run build`

## Testing
- [ ] Test on testnet before mainnet (update `VITE_XRPL_NETWORK` and `XRPL_NETWORK`)
- [ ] Test all affected wallet providers (Xaman, Crossmark, GemWallet)
- [ ] Verify database operations: `cd backend && npm run test:db`
- [ ] Check API endpoints with curl or Postman
- [ ] Test frontend in browser (http://localhost:3000)
- [ ] Verify backend health: http://localhost:3001/health

## Security
- [ ] No hardcoded secrets or private keys
- [ ] Environment variables properly configured (`.env` files not committed)
- [ ] Input validation on all user inputs (backend)
- [ ] Rate limiting in place for new endpoints
- [ ] Wallet address restrictions enforced (employee vs ngo)

## Database
- [ ] Run migrations if schema changed: `cd backend && npm run init-db`
- [ ] Test database connection: `cd backend && npm run test:db`
- [ ] Verify foreign key constraints
- [ ] Check for SQL injection vulnerabilities (use parameterized queries)

## Documentation
- [ ] Update CLAUDE.md if architecture changed
- [ ] Update README.md for new features
- [ ] Add JSDoc comments for complex functions
- [ ] Update type definitions if interfaces changed

## Git
- [ ] Review changes: `git diff`
- [ ] Stage changes: `git add <files>`
- [ ] Write descriptive commit message
- [ ] Check branch: `git branch` (should be on feature branch, not main)
- [ ] Push to remote: `git push`

## Deployment Checklist (Production)
- [ ] Test thoroughly on testnet
- [ ] Switch to mainnet in environment variables
- [ ] Build production frontend: `npm run build`
- [ ] Run deployment: `npm run deploy`
- [ ] Verify deployment health checks
- [ ] Monitor logs for errors

## Common Pre-Commit Checks
```bash
# From root directory
npm run lint                    # Lint frontend
cd frontend && npm run build    # Test TypeScript compilation
cd ../backend && npm run test:db # Test database connection
git status                       # Review changes
git diff                         # Review specific changes
```
