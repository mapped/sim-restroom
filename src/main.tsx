// Copyright 2026 Mapped Inc.
// SPDX-License-Identifier: MIT
// See LICENSE at the repository root for full license text.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
