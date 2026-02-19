import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Apply persisted theme or default to dark before first render
const savedTheme = localStorage.getItem('productivity-theme');
if (savedTheme === 'light') {
  document.documentElement.classList.remove('dark');
} else {
  // Default is dark mode
  document.documentElement.classList.add('dark');
}

createRoot(document.getElementById("root")!).render(<App />);
