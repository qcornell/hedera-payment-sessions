\# 💳 Hedera Payment Sessions



Production-ready payment sessions for micropayments and x402 on Hedera — approve once, pay many times, revoke anytime.



\## 🚀 Features



\- ✅ \*\*Approve Once, Pay Many Times\*\* - Session-based payments without repeated approvals

\- ✅ \*\*Instant Revocation\*\* - Users can revoke access anytime

\- ✅ \*\*Premium Tier Support\*\* - Special handling for premium users

\- ✅ \*\*Leader Approval\*\* - Multi-sig approval workflow for sensitive operations

\- ✅ \*\*PostgreSQL Backend\*\* - Reliable session storage and tracking

\- ✅ \*\*Docker Ready\*\* - One command to start everything



\## 📦 Quick Start



\### Prerequisites



\- Node.js 18+

\- Docker \& Docker Compose

\- Hedera testnet account



\### Installation



```bash

\# Clone the repository

git clone https://github.com/qcornell/hedera-payment-sessions.git

cd hedera-payment-sessions



\# Install dependencies

cd server

npm install



\# Set up environment variables

cp .env.example .env

\# Edit .env with your Hedera credentials



\# Start PostgreSQL

docker-compose up -d



\# Run database migrations

npm run db:migrate



\# Start the server

npm start

