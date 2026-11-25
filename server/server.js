import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import pool from "./db.js";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcrypt";
import crypto from "crypto";
import nodemailer from "nodemailer";

const pgSessions = connectPgSimple(session);
const app = express();
const port = process.env.PORT || 3000;
app.set("trust proxy", 1);
app.use(express.json());

app.use(
  session({
    store: new pgSessions({
      pool: pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

const authUser = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Please log in" });
  }
  next();
};

const cleanBookInfo = (item) => {
  const info = item.volumeInfo;
  return {
    googleId: item.id,
    title: info.title,
    author: info.authors?.join(", "),
    genre: info.categories?.[0],
    description: info.description,
    pages: info.pageCount,
    language: info.language,
    publishYear: info.publishedDate
      ? Number(info.publishedDate.slice(0, 4))
      : undefined,
    thumbnail: info.imageLinks?.thumbnail?.replace(/^http:/, "https:"),
    categories: info.categories ?? [],
  };
};

const BOOK_COLUMNS = `
  id,
  google_id AS "googleId",
  url AS thumbnail,
  title,
  author,
  genre,
  description,
  pages,
  language,
  publish_year AS "publishYear",
  is_favorite AS favorite,
  rating,
  current_page AS "currentPage"
`;

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const mailer =
  process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      })
    : null;

const sendResetEmail = async (to, resetLink) => {
  if (!mailer) {
    console.log("Password reset link:", resetLink);
    return;
  }

  try {
    await mailer.sendMail({
      from: `Chapterly <${process.env.GMAIL_USER}>`,
      to,
      subject: "Reset your Chapterly password",
      text: `We got a request to reset your Chapterly password.

Open this link to choose a new one:
${resetLink}

The link expires in 1 hour. If you didn't ask for this, you can ignore this email.`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; color: #1c2233;">
          <h2>Reset your password</h2>
          <p>We got a request to reset your Chapterly password. Click the button below to choose a new one.</p>
          <p>
            <a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background: #3e3566; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 700;">
              Reset password
            </a>
          </p>
          <p style="color: #6b7186; font-size: 14px;">This link expires in 1 hour. If you didn't ask for this, you can ignore this email.</p>
        </div>
      `,
    });
  } catch (err) {
    console.error("Reset email failed:", err.message);
  }
};

const result = await pool.query("SELECT NOW()");
console.log(result);

app.get("/api/lookup", async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    if (!q) {
      return res.status(400).json({ message: "Please provide a search term" });
    }

    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(`${q}`)}&maxResults=39&key=${process.env.GOOGLE_BOOKS_KEY}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error("google book error:", response.status);
      return res.status(502).json({ message: "Book lookup failed" });
    }

    const data = await response.json();

    const books = (data.items ?? []).map(cleanBookInfo);
    return res.status(200).json({ status: "success", books });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Something went wrong" });
  }
});

app.get("/api/discover", async (req, res) => {
  const DISCOVER_SUBJECTS = [
    "fiction",
    "mystery",
    "fantasy",
    "science fiction",
    "romance",
    "history",
    "poetry",
    "horror",
    "travel",
    "philosophy",
    "biography & autobiography",
    "true crime",
    "humor",
    "science",
    "art",
  ];

  try {
    const subject =
      DISCOVER_SUBJECTS[Math.floor(Math.random() * DISCOVER_SUBJECTS.length)];
    const fetchBooks = async (startIndex) => {
      const url =
        "https://www.googleapis.com/books/v1/volumes?q=" +
        encodeURIComponent('subject:"' + subject + '"') +
        "&startIndex=" +
        startIndex +
        "&maxResults=40&key=" +
        process.env.GOOGLE_BOOKS_KEY;

      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Google Books error: ${response.status}`);
      const data = await response.json();
      return (data.items ?? []).map(cleanBookInfo);
    };
    let books = await fetchBooks(Math.floor(Math.random() * 100));
    if (books.length === 0) books = await fetchBooks(0);
    const ownedIds = new Set();
    if (req.session.userId) {
      const owned = await pool.query(
        "SELECT google_id FROM books WHERE user_id = $1 AND google_id IS NOT NULL",
        [req.session.userId],
      );
      owned.rows.forEach((r) => ownedIds.add(r.google_id));
    }

    const seen = new Set();
    const fresh = books.filter((book) => {
      if (
        !book.thumbnail ||
        ownedIds.has(book.googleId) ||
        seen.has(book.googleId)
      ) {
        return false;
      }
      seen.add(book.googleId);
      return true;
    });
    return res
      .status(200)
      .json({ status: "success", subject, books: shuffle(fresh).slice(0, 39) });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ message: "Discover failed" });
  }
});

app.get("/api/genre", async (req, res) => {
  try {
    const genre = typeof req.query.q === "string" ? req.query.q.trim() : "";

    if (!genre) {
      return res.status(400).json({ message: "Please provide a genre" });
    }

    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(`subject:"${genre}"`)}&maxResults=40&key=${process.env.GOOGLE_BOOKS_KEY}`;

    const response = await fetch(url);

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ message: "Google books request failed" });
    }

    const data = await response.json();

    const books = (data.items ?? []).map(cleanBookInfo);

    return res.status(200).json({ status: "success", books });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Something went wrong" });
  }
});

//POST

app.post("/api/auth/register", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    if (!username || !email || !password) {
      return res.status(400).json({
        message: "Please provide a username, email, and password",
      });
    }

    if (username.includes("@")) {
      return res.status(400).json({
        message: "Usernames can't contain @",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      });
    }

    const existingUser = await pool.query(
      "SELECT email, username FROM users WHERE email = $1 OR username = $2",
      [email, username],
    );

    if (existingUser.rows.length > 0) {
      const message =
        existingUser.rows[0].email === email
          ? "Email is already registered"
          : "Username is already taken";
      return res.status(409).json({ message });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await pool.query(
      "INSERT INTO users (username, email, password_hash) VALUES($1, $2, $3) RETURNING id, username, email, created_at",
      [username, email, hashedPassword],
    );
    return res.status(201).json({
      message: "Account created successfully",
      user: result.rows[0],
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({
        message: "Email or username is already taken",
      });
    }
    console.error(err);
    return res.status(500).json({
      message: "Something went wrong",
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const cleanIdentifier = identifier?.trim();

    if (!cleanIdentifier || !password) {
      return res
        .status(400)
        .json({ message: "Please fill out all required fields" });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 OR username = $1",
      [cleanIdentifier],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        status: "fail",
        message: "Invalid email or password",
      });
    }

    const user = result.rows[0];

    const comparedPass = await bcrypt.compare(password, user.password_hash);

    if (!comparedPass) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    req.session.regenerate((err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "Something went wrong" });
      }
      req.session.userId = user.id;
      return res.status(200).json({
        status: "success",
        message: "Login successful",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
      });
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Something went wrong",
    });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Something went wrong" });
    }

    res.clearCookie("connect.sid");
    return res.status(200).json({ message: "Logged out" });
  });
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
  const sentMessage = {
    message: "If that email is registered, a reset link is on its way.",
  };

  if (!email) {
    return res.status(400).json({ message: "Please provide your email" });
  }

  try {
    const result = await pool.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(200).json(sentMessage);
    }

    const userId = result.rows[0].id;
    const token = crypto.randomBytes(32).toString("hex");

    await pool.query("DELETE FROM password_resets WHERE user_id = $1", [
      userId,
    ]);
    await pool.query(
      "INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')",
      [userId, hashToken(token)],
    );

    const resetLink = process.env.APP_URL + "/?reset=" + token;
    await sendResetEmail(email, resetLink);

    return res.status(200).json(sentMessage);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Something went wrong" });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res
      .status(400)
      .json({ message: "Please provide a token and a new password" });
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ message: "Password must be at least 8 characters" });
  }

  try {
    const result = await pool.query(
      "SELECT id, user_id FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()",
      [hashToken(token)],
    );

    if (result.rows.length === 0) {
      return res
        .status(400)
        .json({ message: "This reset link is invalid or has expired" });
    }

    const { id, user_id } = result.rows[0];
    const hashedPassword = await bcrypt.hash(password, 12);

    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      hashedPassword,
      user_id,
    ]);
    await pool.query(
      "UPDATE password_resets SET used_at = NOW() WHERE id = $1",
      [id],
    );
    await pool.query("DELETE FROM user_sessions WHERE sess->>'userId' = $1", [
      String(user_id),
    ]);

    return res
      .status(200)
      .json({ message: "Password updated. You can log in now." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Something went wrong" });
  }
});

app.post("/api/books", authUser, async (req, res) => {
  try {
    const {
      googleId,
      thumbnail,
      title,
      author,
      genre,
      description,
      pages,
      language,
      publishYear,
      favorite = false,
      rating,
      currentPage = 0,
    } = req.body;
    const cleanTitle = title?.trim();
    if (!cleanTitle) {
      return res.status(400).json({ message: "Please include a book title" });
    }
    const user = req.session.userId;

    const result = await pool.query(
      `INSERT INTO books (user_id, google_id, url, title, author, genre, description, pages, language, publish_year, is_favorite, rating, current_page) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        user,
        googleId,
        thumbnail,
        cleanTitle,
        author,
        genre,
        description,
        pages,
        language,
        publishYear,
        favorite,
        rating,
        currentPage,
      ],
    );

    return res.status(201).json({ status: "success", book: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ message: "Book is already in your library" });
    }
    console.error(err);
    return res.status(500).json({ message: "Something went wrong" });
  }
});

//GET

app.get("/api/auth/me", authUser, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, email FROM users WHERE id = $1",
      [req.session.userId],
    );

    if (result.rows.length === 0) {
      return req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.status(401).json({ message: "Not logged in" });
      });
    }

    return res.status(200).json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Something went wrong" });
  }
});

app.get("/api/books", authUser, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${BOOK_COLUMNS} FROM books WHERE user_id = $1 ORDER BY title`,
      [req.session.userId],
    );

    const library = result.rows;

    return res.status(200).json({
      status: "success",
      books: library,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Something went wrong",
    });
  }
});

app.get("/api/favorites", authUser, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${BOOK_COLUMNS} FROM books WHERE user_id = $1 AND is_favorite = true ORDER BY title`,
      [req.session.userId],
    );

    return res.status(200).json({
      status: "success",
      books: result.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Something went wrong",
    });
  }
});

app.get("/api/books/search", authUser, async (req, res) => {
  try {
    const title = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const genre =
      typeof req.query.genre === "string" ? req.query.genre.trim() : "";
    const user = req.session.userId;

    let result;
    if (title) {
      result = await pool.query(
        ` SELECT ${BOOK_COLUMNS} books WHERE user_id = $1 AND books.title  ILIKE  $2 ORDER BY books.title,`[
          (user, `%${title}%`)
        ],
      );
    } else if (genre) {
      result = await pool.query(
        "SELECT * FROM books WHERE user_id = $1 AND books.genre  ILIKE  $2 ORDER BY books.genre",
        [user, `%${genre}%`],
      );
    } else {
      return res.status(400).json({ message: "Please provide a search term" });
    }

    return res.status(200).json({
      status: "success",
      books: result.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Something went wrong" });
  }
});

app.get("/api/books/:id", authUser, async (req, res) => {
  try {
    const book = Number(req.params.id);
    const user = req.session.userId;

    if (!book || book <= 0) {
      return res.status(400).json({ message: "Enter a valid book id" });
    }

    const result = await pool.query(
      `SELECT  ${BOOK_COLUMNS} FROM books WHERE books.id = $1 AND books.user_id = $2`,
      [book, user],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Book not found" });
    }

    return res.status(200).json({ status: "success", book: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Something went wrong" });
  }
});

//PATCH

app.patch("/api/books/:id", authUser, async (req, res) => {
  try {
    const bookId = Number(req.params.id);
    const user = req.session.userId;
    const { favorite, rating, currentPage } = req.body;

    if (!bookId || bookId <= 0) {
      return res.status(400).json({ message: "enter a valid book id" });
    }
    const result = await pool.query(
      `UPDATE books SET is_favorite = COALESCE($1,is_favorite),rating=COALESCE($2, rating), current_page = COALESCE($3, current_page) WHERE books.id = $4 AND books.user_id = $5 RETURNING *`,
      [favorite ?? null, rating ?? null, currentPage ?? null, bookId, user],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Book not found" });
    }

    return res.status(200).json({
      status: "success",
      book: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Something went wrong" });
  }
});

//DELETE

app.delete("/api/books/:id", authUser, async (req, res) => {
  try {
    const bookId = Number(req.params.id);
    const user = req.session.userId;

    if (!bookId || bookId <= 0) {
      return res.status(400).json({ message: "Enter valid book id" });
    }

    const result = await pool.query(
      "DELETE FROM books WHERE books.id = $1 AND user_id = $2 RETURNING id",
      [bookId, user],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Book not found" });
    }

    return res
      .status(200)
      .json({ status: "success", deletedBookId: result.rows[0].id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Something went wrong" });
  }
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, "../client/dist");
app.use(express.static(clientDist));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) return next();
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
