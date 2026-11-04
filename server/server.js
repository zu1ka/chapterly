import "dotenv/config";
import express from "express";
import pool from "./db.js";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcrypt";

const pgSessions = connectPgSimple(session);
const app = express();
const port = 3000;
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

const result = await pool.query("SELECT NOW()");

app.get("/api/lookup", authUser, async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    if (!q) {
      return res.status(400).json({ message: "Please provide a search term" });
    }

    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(`intitle:${q}`)}&maxResults=10&key=${process.env.GOOGLE_BOOKS_KEY}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error("google book error:", response.status);
      return res.status(502).json({ message: "Book lookup failed" });
    }

    const data = await response.json();

    const books = (data.items ?? []).map((item) => {
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
        thumbnail: info.imageLinks?.thumbnail,
      };
    });
    return res.status(200).json({ status: "success", books });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Something went wrong" });
  }
});

//POST

app.post("/api/auth/register", async (req, res) => {
  console.log("NEW REGISTRATION ROUTE HIT");
  const { username, email, password } = req.body;

  try {
    if (!username || !email || !password) {
      return res.status(400).json({
        message: "Please provide a username, email, and password",
      });
    }

    const existingUser = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email],
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        message: "Email is already registered",
      });
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
        message: "Email is already registered",
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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Please fill out all required fields",
      });
    }
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

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

app.post("/api/books", authUser, async (req, res) => {
  try {
    const {
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
      "INSERT INTO books (user_id, title,author,genre, description, pages, language,publish_year,is_favorite,rating,current_page) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *",
      [
        user,
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
      "SELECT * FROM books WHERE user_id = $1 ORDER BY title",
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

app.get("/api/books/search", authUser, async (req, res) => {
  try {
    const title = req.query.q?.trim();
    const genre = req.query.genre?.trim();
    const user = req.session.userId;

    let result;
    if (title) {
      result = await pool.query(
        "SELECT * FROM books WHERE user_id = $1 AND books.title  ILIKE  $2 ORDER BY books.title",
        [user, `%${title}%`],
      );
    } else if (genre) {
      result = await pool.query(
        "SELECT * FROM books WHERE user_id = $1 AND books.genre  ILIKE  $2 ORDER BY books.genre",
        [user, genre],
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
      "SELECT * FROM books WHERE books.id = $1 AND books.user_id = $2",
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
      `UPDATE books SET is_favorite = COALESCE ($1, is_favorite), rating = COALESCE ($2, rating), current_page = COALESCE($3, current_page) WHERE books.id = $4 AND books.user_id = $5 RETURNING *`,
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

app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
