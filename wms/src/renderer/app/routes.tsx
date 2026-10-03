import { createHashRouter, Navigate } from "react-router-dom";
import { DashboardPage } from "@/features/dashboard/page";
import { ReceivingPage } from "@/features/receiving/page";
import { PickListsPage } from "@/features/picklists/page";
import { FastShipPage } from "@/features/fastship/page";
import { InternalPage } from "@/features/internal/page";
import { ReturnsPage } from "@/features/returns/page";
import { SettingsPage } from "@/features/settings/page";
import { Shell } from "./shell";

/**
 * Hash router so the packaged app works from file://. Add new modules here
 * and in `nav.ts`; each module lives in `features/<name>/`.
 */
export const router = createHashRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "receiving", element: <ReceivingPage /> },
      { path: "picklists", element: <PickListsPage /> },
      { path: "fastship", element: <FastShipPage /> },
      { path: "internal", element: <Navigate to="/internal/transfer" replace /> },
      { path: "internal/:tool", element: <InternalPage /> },
      { path: "returns", element: <ReturnsPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
