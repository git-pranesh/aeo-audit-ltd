import { analytics } from "@heycatch/sdk";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { loadPixel } from "./lib/meta-pixel";

analytics.init({
  projectKey: "hck_pk_UcdGoSp6IP9msvAHpcGe84rGIUqwgWIy",
  install: {
    framework: "vite-react",
    frameworkVersion: "5",
    agent: "claude-code",
  },
});

loadPixel();

createRoot(document.getElementById("root")!).render(<App />);
