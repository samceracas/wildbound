import { useEffect, useState } from "react";
import { fetchPublishedWorld } from "./api.ts";
import { MapView } from "./MapView.tsx";

export function App() {
  const [status, setStatus] = useState("Loading published world…");

  // Proves the data pipeline works: editor -> publish -> API -> here.
  useEffect(() => {
    fetchPublishedWorld()
      .then(({ version, world }) =>
        setStatus(
          version === null
            ? "Nothing published yet. Publish from the map editor."
            : `Published v${version}: ${world.regions.length} region(s), ${world.habitats.length} habitat(s), ${world.pois.length} POI(s)`,
        ),
      )
      .catch((e: unknown) => setStatus(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  return (
    <div className="app">
      <div className="status">{status}</div>
      <MapView />
    </div>
  );
}
