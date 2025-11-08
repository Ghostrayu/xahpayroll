# XAH Payroll Backend API

Backend API server for XAH Payroll application, providing secure proxy endpoints for Xaman wallet integration and other backend services.

## Features

- 🔐 Secure Xaman API proxy (avoids CORS issues)
- 🛡️ Security middleware (Helmet, CORS, Rate Limiting)
- 📡 RESTful API endpoints
- 🔄 Payload status polling

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env` and add your Xaman API credentials:

```env
# Xaman API Configuration
XAMAN_API_KEY=your_xaman_api_key_here
XAMAN_API_SECRET=your_xaman_api_secret_here

# Server Configuration
PORT=3001
FRONTEND_URL=http://localhost:3000
```

Get your Xaman API credentials from: https://apps.xumm.dev/

### 3. Start the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server will start on `http://localhost:3001`

## API Endpoints

### Health Check
```
GET /health
```
Returns server status and timestamp.

### Xaman Wallet Integration

#### Create Sign-In Payload
```
POST /api/xaman/create-signin
Content-Type: application/json

{
  "returnUrl": "http://localhost:3000"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "uuid": "payload-uuid",
    "qrUrl": "https://xumm.app/sign/...",
    "deepLink": "xumm://...",
    "websocketUrl": "wss://..."
  }
}
```

#### Get Payload Status
```
GET /api/xaman/payload/:uuid
```

**Response:**
```json
{
  "success": true,
  "data": {
    "uuid": "payload-uuid",
    "signed": true,
    "resolved": true,
    "expired": false,
    "account": "rXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "txid": "transaction-hash"
  }
}
```

#### Cancel Payload
```
POST /api/xaman/cancel/:uuid
```

#### Create Payment Payload
```
POST /api/xaman/create-payment
Content-Type: application/json

{
  "account": "rSourceAddress",
  "destination": "rDestinationAddress",
  "amount": "10.5",
  "memo": "Payment for services"
}
```

## Security Features

- **Helmet**: Sets secure HTTP headers
- **CORS**: Configured for frontend origin only
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Environment Variables**: Sensitive data stored securely

## Architecture

The backend acts as a secure proxy between the frontend and Xaman API:

```
Frontend (localhost:3000)
    ↓
Backend API (localhost:3001)
    ↓
Xaman API (xumm.app)
```

This architecture:
- Keeps API credentials secure on the server
- Avoids CORS issues with browser requests
- Provides centralized error handling
- Enables request logging and monitoring

## Development

### File Structure

```
backend/
├── server.js           # Main server file
├── routes/
│   └── xaman.js       # Xaman API routes
├── .env               # Environment variables (not in git)
├── .env.example       # Environment template
└── package.json       # Dependencies
```

### Adding New Routes

1. Create a new route file in `routes/`
2. Import and use in `server.js`:

```javascript
const newRoutes = require('./routes/newRoutes')
app.use('/api/new', newRoutes)
```

## Troubleshooting

### CORS Errors
Make sure `FRONTEND_URL` in `.env` matches your frontend URL exactly.

### Xaman API Errors
- Verify your API credentials are correct
- Check that your Xaman application is approved at https://apps.xumm.dev/
- Ensure no typos in API key or secret

### Port Already in Use
Change the `PORT` in `.env` to a different port number.

## License

MIT
