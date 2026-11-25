import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { loadChat, loadGa, loadOai, loadPixel } from "./lib/meta-pixel";

loadPixel();
loadGa();
loadOai();
loadChat();

createRoot(document.getElementById("root")!).render(<App />);
