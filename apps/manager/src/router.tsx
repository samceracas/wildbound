import { createBrowserRouter } from "react-router";

import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { WildkinEditPage } from "@/features/wildkin/WildkinEditPage";
import { WildkinListPage } from "@/features/wildkin/WildkinListPage";
import { NotFoundPage } from "@/features/NotFoundPage";

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "wildkin", element: <WildkinListPage /> },
      { path: "wildkin/new", element: <WildkinEditPage /> },
      { path: "wildkin/:id", element: <WildkinEditPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
