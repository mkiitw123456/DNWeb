import FeedbackHost from "./FeedbackHost.jsx";
import VersionNotice from "./VersionNotice.jsx";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./style.css";
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FeedbackHost />
    <VersionNotice />
    <App />
  </React.StrictMode>,
);
