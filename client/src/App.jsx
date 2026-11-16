import { useEffect } from "react";
import { useState } from "react";
import { useMemo } from "react";
import "./App.css";

function App() {
  const [view, setView] = useState("home");
  const [search, setSearch] = useState("");
  const [books, setBooks] = useState([]);
  const [genre, setGenre] = useState("");
  const [filterGenre, setFilterGenre] = useState([]);
  const [library, setLibrary] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const q = search.trim();
  const pages = ["home", "search", "library", "favorites"];

  useEffect(() => {
    if (!q) {
      setBooks([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/lookup?q=${encodeURIComponent(q)}`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Lookup failed: ${res.status} `);
        const data = await res.json();

        setBooks(data.books ?? []);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error(err);
          setBooks([]);
        }
      }
    }, 800);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  useEffect(() => {
    console.log("genre effect ran:", genre);
    if (!genre) return;
    const controller = new AbortController();

    const getGenre = async () => {
      try {
        const res = await fetch(`/api/genre?q=${encodeURIComponent(genre)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Lookup failed: ${res.status}`);
        }
        const data = await res.json();
        console.log("genre books:", data.books?.length);

        setFilterGenre(data.books);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error(err);
          setFilterGenre([]);
        }
      }
    };
    getGenre();
    return () => controller.abort();
  }, [genre]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">Logo</div>
        <nav className="nav">
          {pages.map((page) => (
            <button
              key={page}
              className={`nav-item ${view === page ? "active" : ""}`}
              onClick={() => setView(page)}
            >
              {page}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="hero">
          <p className="hero-greeting">Greeting</p>
          <h1 className="hero-title">What are you in the mood to read?</h1>
          <SearchBook search={search} setSearch={setSearch} />
        </header>
        <Books books={books} />
        {view === "discover" ? (
          <section>
            <button className="back-btn" onClick={() => setView("home")}>
              Back
            </button>
            <h2>Discover</h2> <Discover />
          </section>
        ) : (
          <>
            <section>
              <h2>Discover</h2>
              <Discover
                limit={6}
                onShowMore={() => setView("discover")}
                setSearch={setSearch}
              />
            </section>
          </>
        )}

        <section>
          <h2>Browse by genre</h2>
          <PickGenre setGenre={setGenre} />
          <RenderGenre filterGenre={filterGenre} />
        </section>

        <section>
          <h2>Library</h2>
          <Library setLibrary={setLibrary} />
          <RenderLibrary library={library} />
        </section>
        <section>
          <h2>Favorites</h2>
          <Favorites setFavorites={setFavorites} />
          <RenderFavoerites favorites={favorites} />
        </section>
      </main>
    </div>
  );
}

const SearchBook = ({ search, setSearch }) => {
  return (
    <>
      <input
        type="text"
        value={search}
        placeholder="Search for books, authors, or topics..."
        className="search-input"
        onChange={(e) => setSearch(e.target.value)}
      />
      {console.log(search)}
    </>
  );
};

const List = ({ book, onClick }) => {
  return (
    <li>
      <button className="book-card" onClick={onClick}>
        <img src={book.thumbnail} />
        <p>{book.title}</p>
        <p>{book.author}</p>
      </button>
    </li>
  );
};

const BookModal = ({ book, onClose }) => {
  const [libStatus, setLibStatus] = useState("idle");
  const [favStatus, setFavStatus] = useState("idle");

  const saveBook = async (favorite, setStatus) => {
    setStatus("saving");
    try {
      const res = await fetch("/api/books", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...book, favorite }),
      });
      if (res.status === 409) return setStatus("exists");
      if (res.status === 401) return setStatus("login");
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      setStatus("saved");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  };

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const tags = [
    ...new Set(
      (book.categories ?? (book.genre ? [book.genre] : []))
        .flatMap((c) => c.split(" / "))
        .filter((c) => c !== "General"),
    ),
  ].slice(0, 3);

  const rounded = Math.round(book.avgRating ?? 0);
  const stars = "★".repeat(rounded) + "☆".repeat(5 - rounded);

  const language = book.language
    ? new Intl.DisplayNames(["en"], { type: "language" }).of(book.language)
    : "—";

  const label = (status, idleText, savedText) =>
    ({
      idle: idleText,
      saving: "Saving…",
      saved: savedText,
      exists: "Already in your library",
      login: "Log in to save",
      error: "Couldn't save. Try again",
    })[status];

  const isDone = (status) =>
    status === "saving" || status === "saved" || status === "exists";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="modal-body">
          <img className="modal-cover" src={book.thumbnail} alt="" />

          <div className="modal-info">
            <h2 className="modal-title">{book.title}</h2>
            <p className="modal-author">{book.author}</p>

            {book.avgRating && (
              <p className="modal-rating">
                <span className="modal-stars" aria-hidden="true">
                  {stars}
                </span>
                {book.avgRating}
                {book.ratingsCount &&
                  ` (${book.ratingsCount.toLocaleString()} ratings)`}
              </p>
            )}

            {tags.length > 0 && (
              <ul className="modal-tags">
                {tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            )}

            {book.description && (
              <p className="modal-description">{book.description}</p>
            )}

            <dl className="modal-stats">
              <div>
                <dt>Pages</dt>
                <dd>{book.pages ?? "—"}</dd>
              </div>
              <div>
                <dt>Language</dt>
                <dd>{language}</dd>
              </div>
              <div>
                <dt>Published</dt>
                <dd>{book.publishYear ?? "—"}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="modal-actions">
          <button
            className="modal-btn modal-btn--primary"
            onClick={() => saveBook(false, setLibStatus)}
            disabled={isDone(libStatus)}
          >
            {label(libStatus, "Add to Library", "Added to Library ✓")}
          </button>
          <button
            className="modal-btn modal-btn--secondary"
            onClick={() => saveBook(true, setFavStatus)}
            disabled={isDone(favStatus)}
          >
            ♡ {label(favStatus, "Add to Favorites", "Added to Favorites")}
          </button>
        </div>
      </div>
    </div>
  );
};
const Books = ({ books }) => {
  const [selected, setSelected] = useState(null);
  return (
    <>
      <ul className="book-list">
        {books.map((book) => {
          return (
            <List
              key={book.googleId}
              book={book}
              onClick={() => setSelected(book)}
            />
          );
        })}
      </ul>
      {selected && (
        <BookModal book={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
};

const PickGenre = ({ setGenre }) => {
  const genres = [
    { label: "Fiction", value: "fiction" },
    { label: "Biography", value: "biography & autobiography" },
    { label: "Mystery", value: "mystery" },
    { label: "Fantasy", value: "fantasy" },
    { label: "Sci-Fi", value: "science fiction" },
    { label: "Romance", value: "romance" },
  ];
  return genres.map((genre) => {
    return (
      <button key={genre.label} onClick={(e) => setGenre(genre.value)}>
        {genre.label}
      </button>
    );
  });
};

const Discover = ({ limit, onShowMore, setSearch }) => {
  const [books, setBooks] = useState([]);

  useEffect(() => {
    const getDiscover = async () => {
      const res = await fetch("/api/discover", { credentials: "include" });
      const data = await res.json();
      setBooks(data.books ?? []);
      console.log(data.books.length);
    };
    getDiscover();
  }, []);

  const handleClick = () => {
    onShowMore();
    setSearch("");
  };

  return (
    <>
      <Books books={books.slice(0, limit)} />
      {limit < books.length && (
        <button className="show-more" onClick={handleClick}>
          Show More
        </button>
      )}
    </>
  );
};

const RenderGenre = ({ filterGenre }) => {
  return <Books books={filterGenre} />;
};

const Library = ({ setLibrary }) => {
  const getLibrary = async () => {
    const res = await fetch("/api/books", { credentials: "include" });
    const data = await res.json();
    setLibrary(data.books ?? []);
  };

  return <button onClick={getLibrary}>Library</button>;
};

const RenderLibrary = ({ library }) => {
  return <Books books={library} />;
};

const Favorites = ({ setFavorites }) => {
  const getFavorites = async () => {
    const res = await fetch("/api/favorites", { credentials: "include" });
    const data = await res.json();
    setFavorites(data.books ?? []);
  };
  return <button onClick={getFavorites}>Favorites</button>;
};

const RenderFavoerites = ({ favorites }) => {
  return <Books books={favorites} />;
};

export default App;
