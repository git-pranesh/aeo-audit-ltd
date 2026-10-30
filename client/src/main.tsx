import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { loadChat, loadGa, loadPixel, loadXray } from "./lib/meta-pixel";

loadPixel();
loadGa();
loadXray();
loadChat();

createRoot(document.getElementById("root")!).render(<App />);
