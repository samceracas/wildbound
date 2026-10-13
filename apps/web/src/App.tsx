import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MapView } from "./MapView.tsx";
import { usePublishedWorld } from "./queries.ts";

export function App() {
  // Proves the data pipeline works: editor -> publish -> API -> here.
  const { data, error, isPending, isFetching, refetch } = usePublishedWorld();

  return (
    <div className="relative h-screen">
      <MapView />

      <Card className="absolute top-3 left-3 z-10 w-80 gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="flex items-center justify-between">
            Wildbound
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => void refetch()}
              disabled={isFetching}
              aria-label="Refresh published world"
            >
              <RefreshCw className={isFetching ? "animate-spin" : undefined} />
            </Button>
          </CardTitle>
          <CardDescription>Published world</CardDescription>
        </CardHeader>
        <CardContent className="px-4 text-sm">
          {isPending && <p className="text-muted-foreground">Loading published world…</p>}
          {error && <p className="text-destructive">{error.message}</p>}
          {data &&
            (data.version === null ? (
              <p className="text-muted-foreground">Nothing published yet. Publish from the map editor.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Badge>v{data.version}</Badge>
                <Badge variant="secondary">{data.world.regions.length} regions</Badge>
                <Badge variant="secondary">{data.world.habitats.length} habitats</Badge>
                <Badge variant="secondary">{data.world.pois.length} POIs</Badge>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
