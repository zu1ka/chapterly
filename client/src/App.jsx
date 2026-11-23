import { useEffect, useRef, useState } from "react";
import {
  Star,
  Heart,
  BookPlus,
  Check,
  X,
  BookOpen,
  User,
  Fingerprint,
  Sparkles,
  Rocket,
  Home,
  Search,
  Library as LibraryIcon,
  LogIn,
  LogOut,
  Menu,
  Trash2,
  Clock,
  Leaf,
  ChevronRight,
} from "lucide-react";

import "./App.css";

const NAV_ITEMS = [
  { id: "home", label: "Home", Icon: Home },
  { id: "search", label: "Search", Icon: Search },
  { id: "library", label: "Library", Icon: LibraryIcon },
  { id: "favorites", label: "Favorites", Icon: Heart },
];

const THEMES = [
  { id: "midnight", label: "Midnight", colors: ["#0f1626", "#7a5c99"] },
  { id: "dark", label: "Dark", colors: ["#0b0f19", "#b9a3dc"] },
  { id: "forest", label: "Forest", colors: ["#13251f", "#4f7a5b"] },
  { id: "sunset", label: "Sunset", colors: ["#2a1720", "#c0563f"] },
];

const getSavedTheme = () => {
  try {
    return localStorage.getItem("theme") ?? "midnight";
  } catch {
    return "midnight";
  }
};

const SEARCH_SUGGESTIONS = [
  "Dune",
  "Stephen King",
  "Cozy mystery",
  "Space opera",
  "Brandon Sanderson",
  "Historical fiction",
  "Agatha Christie",
  "Poetry",
];

const getSavedSearches = () => {
  try {
    return JSON.parse(localStorage.getItem("recentSearches")) ?? [];
  } catch {
    return [];
  }
};

const rememberLastBook = (bookId) => {
  try {
    localStorage.setItem("lastBookId", String(bookId));
  } catch (err) {
    console.error(err);
  }
};

const getLastBookId = () => {
  try {
    return localStorage.getItem("lastBookId");
  } catch {
    return null;
  }
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const STATUS_LABELS = {
  want: "Want to read",
  reading: "Reading",
  completed: "Completed",
};

const getReadingStatus = (currentPage, pages) => {
  if (!currentPage) return "want";
  if (pages && currentPage >= pages) return "completed";
  return "reading";
};

const getProgress = (book) =>
  book.pages > 0 ? (book.currentPage ?? 0) / book.pages : 0;

const SORT_OPTIONS = {
  title: {
    label: "Title",
    compare: (a, b) => (a.title ?? "").localeCompare(b.title ?? ""),
  },
  recent: {
    label: "Recently added",
    compare: (a, b) => b.id - a.id,
  },
  rating: {
    label: "Rating",
    compare: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
  },
  progress: {
    label: "Progress",
    compare: (a, b) => getProgress(b) - getProgress(a),
  },
};

function App() {
  const [view, setView] = useState("home");
  const [search, setSearch] = useState("");
  const [books, setBooks] = useState([]);
  const [genre, setGenre] = useState("");
  const [filterGenre, setFilterGenre] = useState([]);
  const [library, setLibrary] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [resetToken, setResetToken] = useState(() =>
    new URLSearchParams(window.location.search).get("reset"),
  );
  const q = search.trim();
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(getSavedTheme);
  const [recentSearches, setRecentSearches] = useState(getSavedSearches);
  const [continueBook, setContinueBook] = useState(null);
  const [continueRefresh, setContinueRefresh] = useState(0);
  const [libraryFilter, setLibraryFilter] = useState("all");
  const [librarySort, setLibrarySort] = useState("title");
  const mainRef = useRef(null);
  const searchInputRef = useRef(null);
  const activePage = view === "discover" ? "home" : view;

  const statusCounts = {
    all: library.length,
    want: 0,
    reading: 0,
    completed: 0,
  };
  library.forEach((book) => {
    statusCounts[getReadingStatus(book.currentPage, book.pages)] += 1;
  });

  const visibleLibrary = library
    .filter(
      (book) =>
        libraryFilter === "all" ||
        getReadingStatus(book.currentPage, book.pages) === libraryFilter,
    )
    .sort(SORT_OPTIONS[librarySort].compare);

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
        if (!res.ok) throw new Error(`Lookup failed: ${res.status}`);
        const data = await res.json();
        const results = data.books ?? [];
        setBooks(results);
        if (results.length > 0) {
          setRecentSearches((current) =>
            [
              q,
              ...current.filter(
                (term) => !q.toLowerCase().startsWith(term.toLowerCase()),
              ),
            ].slice(0, 6),
          );
        }
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
        setFilterGenre(data.books ?? []);
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

  const loadLibrary = async () => {
    try {
      const res = await fetch("/api/books", { credentials: "include" });
      if (!res.ok) throw new Error(`Library failed: ${res.status}`);
      const data = await res.json();
      setLibrary(data.books ?? []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadFavorites = async () => {
    try {
      const res = await fetch("/api/favorites", { credentials: "include" });
      if (!res.ok) throw new Error(`Favorites failed: ${res.status}`);
      const data = await res.json();
      setFavorites(data.books ?? []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!user) return;
    if (view === "library") loadLibrary();
    if (view === "favorites") loadFavorites();
  }, [view, user]);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        }
      } catch (err) {
        console.error(err);
      }
    };
    checkSession();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch (err) {
      console.error(err);
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem("recentSearches", JSON.stringify(recentSearches));
    } catch (err) {
      console.error(err);
    }
  }, [recentSearches]);

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
    if (view === "search") searchInputRef.current?.focus();
  }, [view]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKey = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [menuOpen]);

  const goTo = (pageId) => {
    setView(pageId);
    setMenuOpen(false);
  };

  const openLogin = () => {
    setShowAuth(true);
    setMenuOpen(false);
  };

  useEffect(() => {
    if (!user || view !== "home") return;
    const lastId = getLastBookId();
    if (!lastId) {
      setContinueBook(null);
      return;
    }

    const controller = new AbortController();
    const loadContinueBook = async () => {
      try {
        const res = await fetch(`/api/books/${lastId}`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok) {
          setContinueBook(null);
          return;
        }
        const data = await res.json();
        const book = data.book;
        const isReading =
          getReadingStatus(book.currentPage, book.pages) === "reading";
        setContinueBook(isReading ? book : null);
      } catch (err) {
        if (err.name !== "AbortError") console.error(err);
      }
    };
    loadContinueBook();
    return () => controller.abort();
  }, [view, user, continueRefresh]);

  const logout = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
    setLibrary([]);
    setFavorites([]);
    setContinueBook(null);
    setMenuOpen(false);
  };

  return (
    <div className="app">
      <header className="mobile-bar">
        <div className="logo">
          <BookOpen size={22} />
          Chapterly
        </div>
        <button
          className="menu-toggle"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="sidebar"
        >
          <Menu size={24} />
        </button>
      </header>

      {menuOpen && (
        <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
      )}

      <aside id="sidebar" className={`sidebar ${menuOpen ? "open" : ""}`}>
        <button
          className="menu-close"
          onClick={() => setMenuOpen(false)}
          aria-label="Close menu"
        >
          <X size={22} />
        </button>

        <div className="logo">
          <BookOpen size={24} />
          Chapterly
        </div>

        <nav className="nav">
          {NAV_ITEMS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`nav-item ${activePage === id ? "active" : ""}`}
              aria-current={activePage === id ? "page" : undefined}
              onClick={() => goTo(id)}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="theme-picker" role="group" aria-label="Color theme">
            {THEMES.map(({ id, label, colors }) => (
              <button
                key={id}
                type="button"
                className={`theme-swatch ${theme === id ? "active" : ""}`}
                style={{
                  background:
                    "linear-gradient(135deg, " +
                    colors[0] +
                    " 50%, " +
                    colors[1] +
                    " 50%)",
                }}
                aria-label={label + " theme"}
                aria-pressed={theme === id}
                title={label}
                onClick={() => setTheme(id)}
              />
            ))}
          </div>
          {user ? (
            <>
              <div className="user">
                <span className="avatar" aria-hidden="true">
                  {user.username[0].toUpperCase()}
                </span>
                <span className="user-name">{user.username}</span>
              </div>
              <button className="nav-item" onClick={logout}>
                <LogOut size={20} />
                Log out
              </button>
            </>
          ) : (
            <button className="nav-item" onClick={openLogin}>
              <LogIn size={20} />
              Log in
            </button>
          )}
        </div>
      </aside>

      <main className="main" ref={mainRef}>
        {(view === "home" || view === "search") && (
          <>
            <header className="hero">
              <p className="hero-greeting">
                {getGreeting()}
                {user ? ", " + user.username : ""}
              </p>
              <h1 className="hero-title">
                {view === "search"
                  ? "What are you looking for?"
                  : "What are you in the mood to read?"}
              </h1>
              <SearchBook
                search={search}
                setSearch={setSearch}
                inputRef={searchInputRef}
                onFocus={() => {
                  if (view === "home") setView("search");
                }}
              />
            </header>
            {view === "search" && q && (
              <section className="section">
                <h2 className="section-title">Results for “{q}”</h2>
                <Books books={books} onLogin={openLogin} />
              </section>
            )}
          </>
        )}

        {view === "search" && !q && (
          <SearchSuggestions
            recent={recentSearches}
            onPick={setSearch}
            onClear={() => setRecentSearches([])}
          />
        )}

        {view === "home" && (
          <>
            {user && (
              <ContinueReading
                book={continueBook}
                onChange={() => setContinueRefresh((count) => count + 1)}
              />
            )}

            <section className="section">
              <h2 className="section-title">Discover</h2>
              <Discover
                limit={6}
                onShowMore={() => setView("discover")}
                setSearch={setSearch}
                onLogin={openLogin}
              />
            </section>

            <section className="section">
              <h2 className="section-title">Browse by genre</h2>
              <PickGenre genre={genre} setGenre={setGenre} />
              <RenderGenre filterGenre={filterGenre} onLogin={openLogin} />
            </section>
          </>
        )}

        {view === "discover" && (
          <section className="section">
            <button className="back-btn" onClick={() => setView("home")}>
              Back
            </button>
            <h2 className="section-title">Discover</h2>
            <Discover onLogin={openLogin} />
          </section>
        )}

        {view === "library" && (
          <section className="section">
            <h2 className="section-title">
              Library
              {user && <span className="section-count">{library.length}</span>}
            </h2>
            {user && library.length === 0 ? (
              <EmptyState
                title="Your library is empty"
                text="Start building your collection by finding books and adding them to your library."
                actionLabel="Explore books"
                onAction={() => goTo("home")}
                secondaryLabel="Or search for a book"
                onSecondary={() => goTo("search")}
              />
            ) : user ? (
              <>
                <LibraryControls
                  filter={libraryFilter}
                  setFilter={setLibraryFilter}
                  sort={librarySort}
                  setSort={setLibrarySort}
                  counts={statusCounts}
                />
                {visibleLibrary.length > 0 ? (
                  <RenderLibrary
                    library={visibleLibrary}
                    onChange={loadLibrary}
                  />
                ) : (
                  <p className="empty">No books here yet.</p>
                )}
              </>
            ) : (
              <LoginPrompt onLogin={openLogin} />
            )}
          </section>
        )}

        {view === "favorites" && (
          <section className="section">
            <h2 className="section-title">
              Favorites
              {user && (
                <span className="section-count">{favorites.length}</span>
              )}
            </h2>
            {user && favorites.length === 0 ? (
              <EmptyState
                showHeart
                title="No favorites yet"
                text="Tap the heart on books you love to find them here later."
                actionLabel="Explore books"
                onAction={() => goTo("home")}
              />
            ) : user ? (
              <RenderFavorites favorites={favorites} onChange={loadFavorites} />
            ) : (
              <LoginPrompt onLogin={openLogin} />
            )}
          </section>
        )}
      </main>

      {showAuth && (
        <AuthForm
          onLogin={(loggedInUser) => {
            setUser(loggedInUser);
            setShowAuth(false);
          }}
          onClose={() => setShowAuth(false)}
        />
      )}

      {resetToken && (
        <ResetPasswordForm
          token={resetToken}
          onDone={() => {
            setResetToken(null);
            window.history.replaceState(null, "", window.location.pathname);
            setShowAuth(true);
          }}
        />
      )}
    </div>
  );
}

const SearchBook = ({ search, setSearch, inputRef, onFocus }) => {
  return (
    <input
      ref={inputRef}
      type="search"
      value={search}
      placeholder="Search for books, authors, or topics..."
      className="search-input"
      aria-label="Search books"
      onFocus={onFocus}
      onChange={(event) => setSearch(event.target.value)}
    />
  );
};

const BookCover = ({ book, className }) => {
  const [failed, setFailed] = useState(false);
  const image = book.thumbnail ?? book.url;

  if (!image || failed) {
    return (
      <div className={`${className} cover-placeholder`} aria-hidden="true">
        <BookOpen size={28} />
        <span className="cover-placeholder-title">{book.title}</span>
      </div>
    );
  }

  return (
    <img
      className={className}
      src={image}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
};

const List = ({ book, onClick }) => {
  const showProgress = book.id && book.pages > 0;
  const percent = showProgress
    ? Math.min(100, Math.round(((book.currentPage ?? 0) / book.pages) * 100))
    : 0;
  const status = getReadingStatus(book.currentPage, book.pages);

  return (
    <li>
      <button className="book-card" onClick={onClick}>
        <BookCover book={book} className="card-cover" />
        <p className="card-title">
          {book.title}
          {book.favorite && (
            <Heart
              className="card-heart"
              size={14}
              fill="currentColor"
              aria-label="Favorite"
            />
          )}
        </p>
        <p>{book.author}</p>
        {book.rating > 0 && (
          <p
            className="card-rating"
            aria-label={`Rated ${book.rating} out of 5`}
          >
            {Array.from({ length: book.rating }, (_, index) => (
              <Star
                key={index}
                size={14}
                fill="currentColor"
                aria-hidden="true"
              />
            ))}
          </p>
        )}
        {book.id && (
          <span className={`status-badge status-badge--${status}`}>
            {STATUS_LABELS[status]}
          </span>
        )}
        {showProgress && (
          <div className="card-progress">
            <div
              className="progress-track"
              role="progressbar"
              aria-label="Reading progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div
                className={`progress-fill progress-fill--${status}`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="progress-text">{percent}%</span>
          </div>
        )}
      </button>
    </li>
  );
};

const BookModal = ({ book, onClose, onChange, onLogin }) => {
  const [bookId, setBookId] = useState(book.id ?? null);
  const [libStatus, setLibStatus] = useState(book.id ? "saved" : "idle");
  const [favStatus, setFavStatus] = useState("idle");
  const [isFavorite, setIsFavorite] = useState(book.favorite ?? false);
  const [rating, setRating] = useState(book.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [currentPage, setCurrentPage] = useState(book.currentPage ?? 0);
  const [removeStatus, setRemoveStatus] = useState("idle");

  const saveBook = async (favorite) => {
    const res = await fetch("/api/books", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...book, favorite }),
    });
    if (res.status === 409) return "exists";
    if (res.status === 401) return "login";
    if (!res.ok) return "error";
    const data = await res.json();
    setBookId(data.book.id);
    onChange?.();
    return "saved";
  };

  const updateBook = async (changes) => {
    const res = await fetch(`/api/books/${bookId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    if (!res.ok) throw new Error(`Update failed: ${res.status}`);
    onChange?.();
  };

  const addToLibrary = async () => {
    setLibStatus("saving");
    try {
      setLibStatus(await saveBook(false));
    } catch (err) {
      console.error(err);
      setLibStatus("error");
    }
  };

  const toggleFavorite = async () => {
    setFavStatus("saving");

    if (!bookId) {
      try {
        const result = await saveBook(true);
        if (result === "saved") {
          setIsFavorite(true);
          setLibStatus("saved");
          setFavStatus("idle");
        } else {
          setFavStatus(result);
        }
      } catch (err) {
        console.error(err);
        setFavStatus("error");
      }
      return;
    }

    const newValue = !isFavorite;
    setIsFavorite(newValue);
    try {
      await updateBook({ favorite: newValue });
      setFavStatus("idle");
    } catch (err) {
      console.error(err);
      setIsFavorite(!newValue);
      setFavStatus("error");
    }
  };

  const rate = async (newRating) => {
    const previousRating = rating;
    setRating(newRating);
    try {
      await updateBook({ rating: newRating });
    } catch (err) {
      console.error(err);
      setRating(previousRating);
    }
  };

  const saveProgress = async () => {
    const pagesRead = Math.max(
      0,
      Math.min(Number(currentPage) || 0, book.pages ?? Infinity),
    );
    setCurrentPage(pagesRead);
    try {
      await updateBook({ currentPage: pagesRead });
      rememberLastBook(bookId);
    } catch (err) {
      console.error(err);
    }
  };

  const removeBook = async () => {
    setRemoveStatus("removing");
    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Remove failed: ${res.status}`);
      setBookId(null);
      setLibStatus("idle");
      setFavStatus("idle");
      setIsFavorite(false);
      setRating(0);
      setCurrentPage(0);
      setRemoveStatus("idle");
      onChange?.();
    } catch (err) {
      console.error(err);
      setRemoveStatus("error");
    }
  };

  const changeStatus = async (newStatus) => {
    const pagesRead = Number(currentPage) || 0;
    let newPage = pagesRead;
    if (newStatus === "want") newPage = 0;
    if (newStatus === "completed") newPage = book.pages;
    if (
      newStatus === "reading" &&
      (pagesRead === 0 || pagesRead >= book.pages)
    ) {
      newPage = 1;
    }

    const previousPage = currentPage;
    setCurrentPage(newPage);
    try {
      await updateBook({ currentPage: newPage });
      rememberLastBook(bookId);
    } catch (err) {
      console.error(err);
      setCurrentPage(previousPage);
    }
  };

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const tags = [
    ...new Set(
      (book.categories ?? (book.genre ? [book.genre] : []))
        .flatMap((category) => category.split(" / "))
        .filter((category) => category !== "General"),
    ),
  ].slice(0, 3);

  const language = book.language
    ? new Intl.DisplayNames(["en"], { type: "language" }).of(book.language)
    : "_";

  const status = getReadingStatus(Number(currentPage), book.pages);

  const libraryLabel = {
    idle: "Add to Library",
    saving: "Adding…",
    saved: "In your Library",
    exists: "Already in your Library",
    login: "Log in to save",
    error: "Couldn't add. Try again",
  }[libStatus];

  const favoriteLabel =
    {
      saving: "Saving…",
      exists: "Already in your Library",
      login: "Log in to save",
      error: "Couldn't save. Try again",
    }[favStatus] ?? (isFavorite ? "Favorited" : "Add to Favorites");

  const isLibraryDisabled = ["saving", "saved", "exists"].includes(libStatus);
  const isFavoriteDisabled = ["saving", "exists"].includes(favStatus);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X size={22} />
        </button>

        <div className="modal-body">
          <BookCover book={book} className="modal-cover" />

          <div className="modal-info">
            <h2 className="modal-title">{book.title}</h2>
            <p className="modal-author">{book.author}</p>

            {bookId ? (
              <div className="modal-rating" onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map((starValue) => {
                  const isFilled = starValue <= (hover || rating);
                  return (
                    <button
                      key={starValue}
                      type="button"
                      className={`star ${isFilled ? "filled" : ""}`}
                      onClick={() => rate(starValue)}
                      onMouseEnter={() => setHover(starValue)}
                      aria-label={`Rate ${starValue} out of 5`}
                    >
                      <Star
                        size={22}
                        fill={isFilled ? "currentColor" : "none"}
                      />
                    </button>
                  );
                })}
                <span className="rating-text">
                  {rating ? `Your rating: ${rating}/5` : "Rate this book"}
                </span>
              </div>
            ) : (
              <p className="modal-rating-hint">
                Add to your library to rate it
              </p>
            )}

            {bookId && (
              <div
                className="status-picker"
                role="group"
                aria-label="Reading status"
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`status-option status-option--${value} ${status === value ? "active" : ""}`}
                    aria-pressed={status === value}
                    onClick={() => changeStatus(value)}
                    disabled={value === "completed" && !book.pages}
                  >
                    {label}
                  </button>
                ))}
              </div>
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
                <dd>
                  {bookId ? (
                    <span className="page-progress">
                      <input
                        className="page-input"
                        type="number"
                        min="0"
                        max={book.pages}
                        value={currentPage}
                        onChange={(event) => setCurrentPage(event.target.value)}
                        onBlur={saveProgress}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.target.blur();
                        }}
                        aria-label="Pages read"
                      />
                      / {book.pages ?? "_"}
                    </span>
                  ) : (
                    (book.pages ?? "_")
                  )}
                </dd>
              </div>
              <div>
                <dt>Language</dt>
                <dd>{language}</dd>
              </div>
              <div>
                <dt>Published</dt>
                <dd>{book.publishYear ?? "_"}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="modal-actions">
          <button
            className="modal-btn modal-btn--primary"
            onClick={addToLibrary}
            disabled={isLibraryDisabled}
          >
            {libStatus === "saved" ? (
              <Check size={18} />
            ) : (
              <BookPlus size={18} />
            )}
            {libraryLabel}
          </button>

          <button
            className={`modal-btn modal-btn--secondary ${isFavorite ? "is-favorite" : ""}`}
            onClick={toggleFavorite}
            disabled={isFavoriteDisabled}
            aria-pressed={isFavorite}
          >
            <Heart
              className="heart-icon"
              size={18}
              fill={isFavorite ? "currentColor" : "none"}
            />
            {favoriteLabel}
          </button>
        </div>

        {(libStatus === "login" || favStatus === "login") && onLogin && (
          <div className="modal-login">
            <p>You need an account to save books.</p>
            <button type="button" className="auth-submit" onClick={onLogin}>
              <LogIn size={18} />
              Log in
            </button>
          </div>
        )}

        {bookId && (
          <div className="modal-remove">
            {removeStatus === "confirm" ? (
              <>
                <span>Remove this book, its rating and your progress?</span>
                <button
                  type="button"
                  className="remove-cancel"
                  onClick={() => setRemoveStatus("idle")}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="remove-confirm"
                  onClick={removeBook}
                >
                  Remove
                </button>
              </>
            ) : (
              <button
                type="button"
                className="remove-link"
                onClick={() => setRemoveStatus("confirm")}
                disabled={removeStatus === "removing"}
              >
                <Trash2 size={16} />
                {removeStatus === "removing"
                  ? "Removing…"
                  : removeStatus === "error"
                    ? "Couldn't remove. Try again"
                    : "Remove from library"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const Books = ({ books, onChange, onLogin }) => {
  const [selected, setSelected] = useState(null);
  return (
    <>
      <ul className="book-list">
        {books.map((book) => {
          return (
            <List
              key={book.googleId ?? book.id}
              book={book}
              onClick={() => setSelected(book)}
            />
          );
        })}
      </ul>
      {selected && (
        <BookModal
          book={selected}
          onClose={() => setSelected(null)}
          onChange={onChange}
          onLogin={onLogin}
        />
      )}
    </>
  );
};

const PickGenre = ({ genre, setGenre }) => {
  const genres = [
    { label: "Fiction", value: "fiction", Icon: BookOpen },
    { label: "Biography", value: "biography & autobiography", Icon: User },
    { label: "Mystery", value: "mystery", Icon: Fingerprint },
    { label: "Fantasy", value: "fantasy", Icon: Sparkles },
    { label: "Sci-Fi", value: "science fiction", Icon: Rocket },
    { label: "Romance", value: "romance", Icon: Heart },
  ];

  return (
    <div className="genre-grid">
      {genres.map(({ label, value, Icon }) => (
        <button
          key={value}
          className={`genre-btn ${genre === value ? "active" : ""}`}
          aria-pressed={genre === value}
          onClick={() => setGenre(value)}
        >
          <Icon size={20} className="genre-icon" />
          {label}
        </button>
      ))}
    </div>
  );
};

const Discover = ({ limit, onShowMore, setSearch, onLogin }) => {
  const [books, setBooks] = useState([]);

  useEffect(() => {
    const getDiscover = async () => {
      try {
        const res = await fetch("/api/discover", { credentials: "include" });
        if (!res.ok) throw new Error(`Discover failed: ${res.status}`);
        const data = await res.json();
        setBooks(data.books ?? []);
      } catch (err) {
        console.error(err);
      }
    };
    getDiscover();
  }, []);

  const handleClick = () => {
    onShowMore();
    setSearch("");
  };

  return (
    <>
      <Books books={books.slice(0, limit)} onLogin={onLogin} />
      {limit < books.length && (
        <button className="show-more" onClick={handleClick}>
          Show More
        </button>
      )}
    </>
  );
};

const RenderGenre = ({ filterGenre, onLogin }) => {
  return <Books books={filterGenre} onLogin={onLogin} />;
};

const RenderLibrary = ({ library, onChange }) => {
  return <Books books={library} onChange={onChange} />;
};

const RenderFavorites = ({ favorites, onChange }) => {
  return <Books books={favorites} onChange={onChange} />;
};

const ContinueReading = ({ book, onChange }) => {
  const [selected, setSelected] = useState(null);

  const percent = book?.pages
    ? Math.min(100, Math.round(((book.currentPage ?? 0) / book.pages) * 100))
    : 0;

  return (
    <>
      {book && (
        <section className="section">
          <h2 className="section-title">Continue reading</h2>
          <button
            type="button"
            className="continue-card"
            onClick={() => setSelected(book)}
          >
            <BookCover book={book} className="continue-cover" />
            <div className="continue-info">
              <p className="continue-title">{book.title}</p>
              <p className="continue-author">{book.author}</p>
              <div className="continue-progress">
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label="Reading progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                >
                  <div
                    className="progress-fill progress-fill--reading"
                    style={{ width: percent + "%" }}
                  />
                </div>
                <span className="continue-meta">
                  Page {book.currentPage} of {book.pages} · {percent}%
                </span>
              </div>
            </div>
            <ChevronRight className="continue-arrow" size={22} />
          </button>
        </section>
      )}

      {selected && (
        <BookModal
          book={selected}
          onClose={() => setSelected(null)}
          onChange={onChange}
        />
      )}
    </>
  );
};

const SearchSuggestions = ({ recent, onPick, onClear }) => {
  return (
    <>
      {recent.length > 0 && (
        <section className="section">
          <div className="section-header">
            <h2 className="section-title">Recent searches</h2>
            <button type="button" className="clear-link" onClick={onClear}>
              Clear
            </button>
          </div>
          <div className="chip-list">
            {recent.map((term) => (
              <button
                key={term}
                type="button"
                className="chip"
                onClick={() => onPick(term)}
              >
                <Clock size={14} aria-hidden="true" />
                {term}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Try searching for</h2>
        <div className="chip-list">
          {SEARCH_SUGGESTIONS.map((term) => (
            <button
              key={term}
              type="button"
              className="chip"
              onClick={() => onPick(term)}
            >
              <Search size={14} aria-hidden="true" />
              {term}
            </button>
          ))}
        </div>
      </section>
    </>
  );
};

const LibraryControls = ({ filter, setFilter, sort, setSort, counts }) => {
  const tabs = [["all", "All"], ...Object.entries(STATUS_LABELS)];

  return (
    <div className="library-controls">
      <div className="filter-tabs" role="group" aria-label="Filter by status">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`filter-tab ${filter === value ? "active" : ""}`}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
            <span className="filter-count">{counts[value]}</span>
          </button>
        ))}
      </div>

      <label className="sort-select">
        Sort by
        <select value={sort} onChange={(event) => setSort(event.target.value)}>
          {Object.entries(SORT_OPTIONS).map(([value, { label }]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};

const EmptyIllustration = ({ showHeart }) => {
  const MainIcon = showHeart ? Heart : LibraryIcon;

  return (
    <div className="empty-illustration" aria-hidden="true">
      <Leaf className="empty-deco empty-deco--left" size={30} />
      <div className="empty-circle">
        <MainIcon size={56} strokeWidth={1.5} />
      </div>
      <Sparkles className="empty-deco empty-deco--right" size={24} />
    </div>
  );
};

const EmptyState = ({
  showHeart,
  title,
  text,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}) => {
  return (
    <div className="empty-state">
      <EmptyIllustration showHeart={showHeart} />
      <h3 className="empty-title">{title}</h3>
      <p className="empty-text">{text}</p>
      <button type="button" className="auth-submit" onClick={onAction}>
        {actionLabel}
      </button>
      {secondaryLabel && (
        <button
          type="button"
          className="auth-link empty-secondary"
          onClick={onSecondary}
        >
          {secondaryLabel}
        </button>
      )}
    </div>
  );
};

const LoginPrompt = ({ onLogin }) => {
  return (
    <div className="login-prompt">
      <p>Log in to save books, rate them and track your reading.</p>
      <button className="auth-submit" onClick={onLogin}>
        Log in
      </button>
    </div>
  );
};

const AuthForm = ({ onLogin, onClose }) => {
  const [mode, setMode] = useState("login");
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegister = mode === "register";
  const isForgot = mode === "forgot";

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const postJson = (url, body) =>
    fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);
    try {
      if (isForgot) {
        const res = await postJson("/api/auth/forgot-password", { email });
        const data = await res.json();
        if (!res.ok) {
          setError(data.message ?? "Couldn't send the reset link");
          return;
        }
        setNotice(data.message);
        return;
      }

      if (isRegister) {
        const res = await postJson("/api/auth/register", {
          username,
          email,
          password,
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.message ?? "Couldn't create your account");
          return;
        }
      }

      const res = await postJson("/api/auth/login", {
        identifier: isRegister ? email : identifier,
        password,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Couldn't log in");
        return;
      }
      onLogin(data.user);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const goTo = (newMode) => {
    setMode(newMode);
    setError("");
    setNotice("");
  };

  const title = {
    login: "Welcome back",
    register: "Create an account",
    forgot: "Reset your password",
  }[mode];

  const subtitle = {
    login: "Log in to see your library.",
    register: "Start building your library.",
    forgot: "Enter your email and we'll send you a reset link.",
  }[mode];

  const submitLabel = {
    login: "Log in",
    register: "Create account",
    forgot: "Send reset link",
  }[mode];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="auth-card"
        onSubmit={handleSubmit}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={22} />
        </button>

        <h1 className="auth-title">{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>

        {isRegister && (
          <label className="auth-field">
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
        )}

        {(isRegister || isForgot) && (
          <label className="auth-field">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
        )}

        {mode === "login" && (
          <label className="auth-field">
            Email or username
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
        )}

        {!isForgot && (
          <label className="auth-field">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isRegister ? "new-password" : "current-password"}
              minLength={isRegister ? 8 : undefined}
              required
            />
          </label>
        )}

        {mode === "login" && (
          <button
            type="button"
            className="auth-link auth-forgot"
            onClick={() => goTo("forgot")}
          >
            Forgot password?
          </button>
        )}

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        {notice && (
          <p className="auth-notice" role="status">
            {notice}
          </p>
        )}

        <button className="auth-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Please wait…" : submitLabel}
        </button>

        <p className="auth-switch">
          {mode === "login" ? (
            <>
              New here?{" "}
              <button
                type="button"
                className="auth-link"
                onClick={() => goTo("register")}
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              {isRegister ? "Already have an account?" : "Remembered it?"}{" "}
              <button
                type="button"
                className="auth-link"
                onClick={() => goTo("login")}
              >
                Log in
              </button>
            </>
          )}
        </p>
      </form>
    </div>
  );
};

const ResetPasswordForm = ({ token, onDone }) => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isDone, setIsDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("The passwords don't match");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Couldn't reset your password");
        return;
      }
      setIsDone(true);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isDone) {
    return (
      <div className="modal-backdrop">
        <div className="auth-card">
          <h1 className="auth-title">Password updated</h1>
          <p className="auth-subtitle">
            You can log in with your new password.
          </p>
          <button className="auth-submit" onClick={onDone}>
            Log in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">Set a new password</h1>
        <p className="auth-subtitle">Use at least 8 characters.</p>

        <label className="auth-field">
          New password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>

        <label className="auth-field">
          Confirm password
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button className="auth-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Please wait…" : "Update password"}
        </button>
      </form>
    </div>
  );
};

export default App;
