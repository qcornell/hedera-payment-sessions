# 💳 HashToll - Hedera Payment Sessions

**The first allowance-based API gateway on Hedera** — approve once, pay per API call, revoke anytime.

## 🌟 What is HashToll?

HashToll enables **pay-per-use API access** using Hedera's native allowance system. Users approve a spending limit once, then get charged automatically per API call — no subscriptions, no upfront payments, no API keys.

### 🎯 Key Benefits

- **No Subscriptions** - Pay only for what you use
- **Your HBAR Stays in Your Wallet** - Only spend when you make API calls
- **Transparent Pricing** - 0.5 HBAR per premium endpoint call
- **Instant Revocation** - Cancel access anytime with one transaction
- **Session-Based** - Secure, time-limited sessions (24hr default)
- **Production Ready** - Live on Hedera mainnet

## 🚀 Features

- ✅ **Allowance-Based Payments** - Approve once, deduct per API call
- ✅ **Session Management** - Secure 24-hour sessions with unique IDs
- ✅ **Instant Revocation** - Users can revoke allowances anytime via UI
- ✅ **Idempotency Support** - Safe retries with idempotency keys
- ✅ **Mirror Node Integration** - Real-time allowance verification
- ✅ **WalletConnect v2** - Seamless HashPack wallet integration
- ✅ **PostgreSQL Backend** - Reliable session storage and tracking
- ✅ **Docker Ready** - One command to start everything
- ✅ **Production Deployed** - Running on Railway

## 🏗️ Architecture


User Wallet (HashPack)
↓
Approve Allowance (one-time)
↓
Activate Session → Get Session ID
↓
Call API with Session ID
↓
Backend Deducts from Allowance
↓
Return Premium Data

vala

## 📦 Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Hedera **mainnet** account (0.0.10206295 is the spender)
- HashPack wallet

### Installation

```bash
# Clone the repository
git clone https://github.com/qcornell/hedera-payment-sessions.git
cd hedera-payment-sessions

# Install dependencies
cd server
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials:
# - HEDERA_OPERATOR_ID=0.0.10206295
# - HEDERA_OPERATOR_KEY=your-private-key
# - DATABASE_URL=postgresql://...
# - PORT=3000

# Start PostgreSQL
docker-compose up -d

# Run database migrations
npm run db:migrate

# Start the server
npm start

The API will be available at http://localhost:3000

🔧 API Endpoints
Health Check
bash
GET /health

Activate Session
bash
POST /api/sessions/activate
Content-Type: application/json

{
  "userAccountId": "0.0.12345",
  "expiryHours": 24,
  "productName": "premium"
}

Response:

json
{
  "session": {
    "id": "sess_abc123...",
    "userId": "0.0.12345",
    "expiresAt": "2026-01-02T12:00:00Z"
  }
}

Call Premium Endpoint
bash
GET /api/premium
Headers:
  x-hedera-session-id: sess_abc123...
  x-idempotency-key: unique-request-id

Cost: 0.5 HBAR per call

Response (200 OK):

json
{
  "message": "Premium data accessed",
  "charged": "0.5 HBAR",
  "data": { ... }
}

Response (402 Payment Required):

json
{
  "error": "Insufficient allowance",
  "hedera": {
    "instructions": "Please approve more HBAR allowance",
    "spenderAccount": "0.0.10206295",
    "requiredAmount": "0.5"
  }
}

💻 Frontend Integration
See the included index.html for a complete React-free implementation using:

Hedera SDK (@hashgraph/sdk)
WalletConnect (@hashgraph/hedera-wallet-connect)
Tailwind CSS
Basic Flow
javascript
// 1. Connect wallet
const accountId = await window.hederaConnect.connect();

// 2. Approve allowance (one-time)
const tx = new AccountAllowanceApproveTransaction()
  .approveHbarAllowance(userAccount, spenderAccount, amount);
await hederaConnect.signTransaction(tx);

// 3. Activate session
const response = await fetch('/api/sessions/activate', {
  method: 'POST',
  body: JSON.stringify({
    userAccountId: accountId,
    expiryHours: 24,
    productName: 'premium'
  })
});
const { session } = await response.json();

// 4. Call premium endpoint
const data = await fetch('/api/premium', {
  headers: {
    'x-hedera-session-id': session.id,
    'x-idempotency-key': crypto.randomUUID()
  }
});

🔐 Security Features
Allowance-Based - Never transfer HBAR upfront
Session Expiry - 24-hour automatic expiration
Idempotency - Prevents duplicate charges
Mirror Node Verification - Real-time balance checks
User Revocation - One-click allowance cancellation
🌐 Live Example
Frontend: https://hashtoll.com
API: https://hashtoll-api-production.up.railway.app

Try it yourself:

Visit Hashtoll
Connect your HashPack wallet
Approve 10-100 HBAR allowance
Activate a session
Call the premium endpoint
📊 Pricing
Endpoint	Cost	What You Get
/api/premium	0.5 HBAR	Premium data access
Recommended Allowance: 100 HBAR ≈ 200 API calls

🛠️ Tech Stack
Backend:

Node.js + Express
TypeScript
PostgreSQL (session storage)
Hedera SDK
Docker
Frontend:

Vanilla JavaScript (no framework)
Hedera WalletConnect
Tailwind CSS
📝 Environment Variables
env
# Hedera Configuration
HEDERA_NETWORK=mainnet
HEDERA_OPERATOR_ID=0.0.10206295
HEDERA_OPERATOR_KEY=302e...

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/hashtoll

# Server
PORT=3000
NODE_ENV=production

# Pricing
PREMIUM_ENDPOINT_COST_HBAR=0.5

🚢 Deployment
Railway (Current Production)
bash
railway up

Docker
bash
docker-compose up --build

🤝 Contributing
Contributions welcome! Please read our contributing guidelines first.

📄 License
MIT License - see LICENSE file for details

🔗 Links
Live Demo: https://your-domain.com
API Docs: [Coming Soon]
Hedera Docs: https://docs.hedera.com
Support: [Discord/Telegram]
💡 Use Cases
API Marketplaces - Monetize APIs without subscriptions
Micropayment Services - Pay-per-use content access
dApp Backends - Charge for premium features
Data Providers - Pay-per-query data access
🎓 How It Works
User approves allowance - One-time Hedera transaction
Backend verifies allowance - Checks mirror node
Session created - 24-hour access granted
API calls deduct HBAR - Automatic per-call charging
User can revoke - Anytime via HashPack or UI
Built with ❤️ on Hedera Hashgraph

markdown

## Key Improvements:

1. ✅ **More accurate title** - "HashToll" instead of generic "Payment Sessions"
2. ✅ **Mainnet focus** - Changed from testnet to mainnet
3. ✅ **Actual API endpoints** - Documented real endpoints with examples
4. ✅ **Live demo section** - Added production URLs
5. ✅ **Pricing table** - Shows actual 0.5 HBAR cost
6. ✅ **Frontend integration** - Added code examples
7. ✅ **Security features** - Highlighted allowance-based approach
8. ✅ **Use cases** - Added practical applications
9. ✅ **Tech stack** - Accurate list of technologies
10. ✅ **Removed "Leader Approval"** - Not in your current implementation

Would you like me to add anything else, like a troubleshooting section or FAQ? 🚀
