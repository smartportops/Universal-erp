import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { DataProvider } from "@/data/provider";
import { ToastProvider } from "@/ui/toast";
import { router } from "./app/routes";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DataProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </DataProvider>
  </StrictMode>,
);
