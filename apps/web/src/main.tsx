import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { LocationProvider } from "./features/location/LocationProvider.tsx";
import { queryClient } from "./lib/query-client.ts";
import { router } from "./router.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LocationProvider>
        <RouterProvider router={router} />
      </LocationProvider>
      {/* Stripped from production builds automatically. */}
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="top-left" />
    </QueryClientProvider>
  </StrictMode>,
);
