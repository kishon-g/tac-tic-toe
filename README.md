# WhatsApp Tic-Tac-Toe Server

A 2-Player (Player vs. Player) Tic-Tac-Toe WhatsApp bot server built with Express, TypeScript, and PostgreSQL.

## How to Play

1. **Invite**: Send `play <country_code><phone_number>` to the bot (e.g., `play +xxxxxxxxxx`).
2. **Accept**: The invited player replies `accept`.
3. **Play**: Take turns replying with a number from `1` to `9` to select a square on the board!

---

## Local Development

1. Start PostgreSQL with Docker:

   ```bash
   docker compose up -d
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file, add the following Environment Variables:

| Variable                   | Description                                     |
| :------------------------- | :---------------------------------------------- |
| `PORT`                     | Port number to run the server (default: `3000`) |
| `NODE_ENV`                 | `development` or `production`                   |
| `DATABASE_URL`             | PostgreSQL connection string                    |
| `WHATSAPP_ACCESS_TOKEN`    | Meta Access Token                               |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp Phone Number ID                   |
| `WHATSAPP_VERIFY_TOKEN`    | Webhook verification secret                     |

> _Note: If `DATABASE_URL` is omitted, the server will automatically run using the in-memory database store._

4. Run development server:

   ```bash
   npm run dev
   ```

5. In another terminal, run:

   ```bash
   ngrok http 3000
   ```