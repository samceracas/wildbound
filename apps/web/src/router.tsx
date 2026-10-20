import { createBrowserRouter, Navigate } from "react-router";
import { LoginPage } from "./features/auth/LoginPage.tsx";
import { GameLayout } from "./features/game/GameLayout.tsx";
import { InventoryPage } from "./features/inventory/InventoryPage.tsx";
import { LocationGatePage } from "./features/location/LocationGatePage.tsx";
import { PartyPage } from "./features/party/PartyPage.tsx";
import { RadarPage } from "./features/radar/RadarPage.tsx";
import { RegistryDetailPage } from "./features/registry/RegistryDetailPage.tsx";
import { RegistryPage } from "./features/registry/RegistryPage.tsx";
import { RequireSession } from "./features/auth/RequireSession.tsx";

/**
 * Flow: / (username) → /location (allow sharing) → /play (radar, registry, satchel, party).
 * Each step guards the next: no session → back to /, no location fix → back to /location.
 */
export const router = createBrowserRouter([
  { path: "/", element: <LoginPage /> },
  {
    element: <RequireSession />,
    children: [
      { path: "/location", element: <LocationGatePage /> },
      {
        path: "/play",
        element: <GameLayout />,
        children: [
          { index: true, element: <RadarPage /> },
          { path: "registry", element: <RegistryPage /> },
          { path: "registry/:creatureId", element: <RegistryDetailPage /> },
          { path: "satchel", element: <InventoryPage /> },
          { path: "party", element: <PartyPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
