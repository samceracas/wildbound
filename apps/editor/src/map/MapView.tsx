import { useEffect, useRef } from "react";
import { EditorMap } from "./editor-map.ts";

export function MapView() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const editorMap = new EditorMap(ref.current);
    return () => editorMap.destroy();
  }, []);
  return <div ref={ref} className="map" />;
}
