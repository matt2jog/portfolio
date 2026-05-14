import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initLogRocket } from "./lib/logrocket";

initLogRocket();

createRoot(document.getElementById("root")!).render(<App />);
