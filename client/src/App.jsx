import { useEffect } from "react";
import { useState } from "react";
import { useMemo } from "react";
import "./App.css";

function App() {
  const [search, setSearch] = useState("");
  const [books, setBooks] = useState([]);
  const [genre, setGenre] = useState("");
  const [filterGenre, setFilterGenre] = useState([]);
  const q = search.trim();
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
    <>
      <section>
        <h2>Search Book</h2>
        <SearchBook search={search} setSearch={setSearch} />
        <Books books={books} />
      </section>

      <section>
        <h2>Browse by genre</h2>
        <PickGenre setGenre={setGenre} />
        <GenreShow filterGenre={filterGenre} />
      </section>

      <section>
        <h2>Discover</h2>
        <Discover />
      </section>
    </>
  );
}

const SearchBook = ({ search, setSearch }) => {
  return (
    <>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {console.log(search)}
    </>
  );
};

const List = ({ book }) => {
  return (
    <li>
      <img src={book.thumbnail} />
      <p>{book.title}</p>
      <p>{book.author}</p>
    </li>
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

const Discover = () => {
  const [books, setBooks] = useState([]);

  useEffect(() => {
    const getDiscover = async () => {
      const res = await fetch("/api/discover", { credentials: "include" });
      const data = await res.json();
      setBooks(data.books ?? []);
    };
    getDiscover();
  }, []);

  return <Books books={books} />;
};
const Books = ({ books }) => {
  return (
    <ul>
      {books.map((book) => {
        return <List key={book.googleId} book={book} />;
      })}
    </ul>
  );
};

const GenreShow = ({ filterGenre }) => {
  return <Books books={filterGenre} />;
};

export default App;
