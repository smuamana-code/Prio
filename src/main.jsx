import React from "react";
import { createRoot } from "react-dom/client";
import TaskRanker from "./TaskRanker.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <TaskRanker />
  </React.StrictMode>
);
