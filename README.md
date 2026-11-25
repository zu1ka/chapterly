# Chapterly

A full-stack reading tracker for discovering books, building a personal library and keeping track of what you read.

Search millions of books through the Google Books API, save the ones you want to read, rate them, log your progress page by page and pick up right where you left off.

**Live demo:** [chapterly-qfnx.onrender.com](https://chapterly-qfnx.onrender.com)

_Hosted on a free plan, so the first visit after a quiet period can take up to a minute to load._

---

## Features

**Discover and search**

- Search by title, author or topic, with recent searches and suggestions
- A Discover feed with a fresh mix of books from a random subject on every visit
- Browse by genre: Fiction, Biography, Mystery, Fantasy, Sci-Fi and Romance
- A detailed book view with cover, description, genres, page count, language and publish year

**Your library**

- Save books to your library and mark favorites
- Rate books from 1 to 5 stars
- Track reading progress by page, with a progress bar on every book
- Reading statuses (Want to read, Reading, Completed) that update automatically from your progress
- Filter your library by status and sort by title, rating, progress or date added
- A "Continue reading" card on the home page for the book you're in the middle of

**Accounts**

- Sign up and log in with your email or username
- Browse freely without an account, and log in only when you want to save books
- Secure password reset by email, with single-use links that expire after an hour

**Design**

- Responsive layout with a slide-out menu on mobile
- Four color themes (Midnight, Dark, Forest and Sunset), remembered between visits
- Placeholder covers for books without an image, and friendly empty states
- Keyboard and screen reader support, and reduced motion for users who prefer it

---

## Tech stack

| Layer    | Tools                                            |
| -------- | ------------------------------------------------ |
| Frontend | React, Vite, Lucide icons, CSS custom properties |
| Backend  | Node.js, Express                                 |
| Database | PostgreSQL                                       |
| Auth     | express-session, connect-pg-simple, bcrypt       |
| Email    | Nodemailer                                       |
| Data     | Google Books API                                 |
| Hosting  | Render, Neon                                     |

---

## How it works

**Authentication.** Passwords are hashed with bcrypt before they're stored. Logging in creates a server-side session stored in PostgreSQL, and the browser only holds an `httpOnly` session cookie, so the session can't be read by JavaScript on the page. The session is regenerated on every login to prevent session fixation.

**Password reset.** Requesting a reset generates a random 32-byte token. Only a SHA-256 hash of the token is stored in the database, so a leaked database can't be used to reset passwords. Each link expires after one hour, works only once, and a successful reset signs the user out on every other device. The reset form always gives the same response, so it can't be used to check whether an email has an account.

**Books.** The server fetches books from the Google Books API and cleans them into a consistent shape before sending them to the client. Saved books are stored per user in PostgreSQL and returned in the same shape, so the same components display search results and library books alike.

**Themes.** Every color in the app is a CSS custom property. Each theme overrides those properties under a `data-theme` attribute, so switching themes is a single attribute change with no extra styles per component.

---

## Getting started

### Prerequisites

- Node.js 18 or later
- PostgreSQL
- A Google Books API key ([get one here](https://developers.google.com/books/docs/v1/using#APIKey))
- Optional: a Gmail account with an [app password](https://myaccount.google.com/apppasswords) for sending reset emails

### 1. Clone and install

```bash
git clone https://github.com/zu1ka/chapterly.git
cd chapterly

cd server
npm install

cd ../client
npm install
```

### 2. Set up the database

Create a database, then create the tables:

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE books (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  genre TEXT,
  description TEXT,
  pages INTEGER CHECK (pages > 0),
  language TEXT,
  publish_year INTEGER,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMP DEFAULT NOW(),
  current_page INTEGER NOT NULL DEFAULT 0 CHECK (current_page >= 0),
  url TEXT,
  google_id TEXT,
  CONSTRAINT books_user_google_unique UNIQUE (user_id, google_id),
  CONSTRAINT current_page_within_pages CHECK (current_page <= pages)
);

CREATE INDEX idx_books_user_id ON books (user_id);

CREATE TABLE password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);
```

The session table (`user_sessions`) is created automatically the first time the server starts.

### 3. Add environment variables

Create a `.env` file in the `server` folder:

```
DATABASE_URL=postgres://user:password@localhost:5432/chapterly
SESSION_SECRET=a-long-random-string
GOOGLE_BOOKS_KEY=your-google-books-api-key
APP_URL=http://localhost:5173

GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=your-16-character-app-password
```

If `GMAIL_USER` and `GMAIL_APP_PASSWORD` are left out, reset links are printed in the server's terminal instead of emailed, which is handy for local development.

### 4. Run it

In one terminal:

```bash
cd server
npm start
```

In another:

```bash
cd client
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite dev server forwards requests starting with `/api` to the Express server on port 3000.

---

## Deployment

The live app runs as a single service on [Render](https://render.com), with the database hosted on [Neon](https://neon.com). Express serves the built React app and the API from the same address, so no extra CORS or cookie setup is needed.

- **Build command:** `cd client && npm install --include=dev && npm run build && cd ../server && npm install`
- **Start command:** `cd server && npm start`
- **Environment variables:** the same as the `.env` above, plus `NODE_ENV=production`, with `APP_URL` set to the live address

Every push to `main` triggers a new deploy.

---

## API overview

| Method | Route                       | Description                           |
| ------ | --------------------------- | ------------------------------------- |
| GET    | `/api/lookup?q=`            | Search Google Books                   |
| GET    | `/api/discover`             | Random selection of books             |
| GET    | `/api/genre?q=`             | Books in a genre                      |
| POST   | `/api/auth/register`        | Create an account                     |
| POST   | `/api/auth/login`           | Log in with email or username         |
| POST   | `/api/auth/logout`          | Log out                               |
| GET    | `/api/auth/me`              | Current user                          |
| POST   | `/api/auth/forgot-password` | Email a password reset link           |
| POST   | `/api/auth/reset-password`  | Set a new password with a reset token |
| GET    | `/api/books`                | Your library                          |
| GET    | `/api/favorites`            | Your favorite books                   |
| GET    | `/api/books/:id`            | One book from your library            |
| POST   | `/api/books`                | Add a book to your library            |
| PATCH  | `/api/books/:id`            | Update rating, favorite or progress   |
| DELETE | `/api/books/:id`            | Remove a book from your library       |

---

## Future Improvements

- [x] Deploy a live version
- [ ] Split the frontend into separate component files
- [ ] Rate limiting on login and password reset
- [ ] Shareable links that open a specific book
- [ ] Tests for the API routes
- [ ] Reading stats, like books finished per month

---

## License

MIT
