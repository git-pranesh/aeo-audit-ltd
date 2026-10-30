import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { loadChat, loadGa, loadPixel } from "./lib/meta-pixel";

loadPixel();
loadGa();
loadChat();

createRoot(document.getElementById("root")!).render(<App />);
