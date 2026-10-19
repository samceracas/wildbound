import { useEffect, useRef } from "react";
import { EditorMap } from "./editor-map.ts";

export function MapView() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const editorMap = new EditorMap(ref.current);
    return () => editorMap.destroy();
  }, []);
  // `!`: maplibre-gl.css (unlayered) sets .maplibregl-map { position: relative }, which beats layered utilities.
  return <div ref={ref} className="absolute! inset-0" />;
}
