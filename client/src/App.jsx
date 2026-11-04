import { useEffect } from "react";
import { useState } from "react";

function App() {
  const [search, setSearch] = useState("");
  const [books, setBooks] = useState([]);

  useEffect(() => {
    if (!search.trim()) {
      setBooks([]);
      return;
    }
    const timer = setTimeout(async () => {
      const data = await fetch("/api/lookup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search }),
      });
      const res = await data.json();
      setBooks(res);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <>
      <SearchBook search={search} setSearch={setSearch} />
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

export default App;
