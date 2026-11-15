import { useState } from "react";
import { Link } from "react-router-dom";
import { dummyProducts } from "../data/dummyProducts";

export default function MyListings() {
  const [items, setItems] = useState(dummyProducts);

  const toggleStatus = (id) => {
    setItems(items.map((p) =>
      p._id === id
        ? { ...p, status: p.status === "available" ? "unavailable" : "available" }
        : p
    ));
  };

  const remove = (id) => {
    if (!window.confirm("Delete this listing?")) return;
    setItems(items.filter((p) => p._id !== id));
  };

  return (
    <div className="max-w-5xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">My Listings</h1>
      {items.length === 0 && <p>You haven't listed anything yet.</p>}

      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        {items.map((p) => (
          <div key={p._id} className={`border rounded-xl p-3 ${p.status === "unavailable" ? "opacity-50" : ""}`}>
            <img src={p.imageUrl} alt={p.title} className="rounded-lg mb-2 h-48 w-full object-cover" />
            <Link to={`/product/${p._id}`} className="font-semibold">{p.title}</Link>
            <p className="text-sm capitalize text-gray-500">{p.listingType} · {p.status}</p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => toggleStatus(p._id)} className="text-sm border px-3 py-1 rounded-lg">
                {p.status === "available" ? "Mark unavailable" : "Mark available"}
              </button>
              <button onClick={() => remove(p._id)} className="text-sm text-red-600 px-3 py-1">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}