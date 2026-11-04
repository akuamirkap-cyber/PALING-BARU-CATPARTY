import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

/**
 * Never show a blank page. If the app fails to boot (or a stray runtime error
 * escapes React), print the reason on screen instead of leaving nothing.
 */
function showFatal(message: string) {
  const host = document.getElementById("root");
  if (!host) return;
  if (document.getElementById("boot-error")) return;
  const box = document.createElement("div");
  box.id = "boot-error";
  box.setAttribute("role", "alert");
  box.innerHTML = `
    <strong>Meow Brawl gagal dimuat</strong>
    <span></span>
    <button type="button">MUAT ULANG</button>
  `;
  box.querySelector("span")!.textContent = message;
  box.querySelector("button")!.addEventListener("click", () => location.reload());
  document.body.appendChild(box);
}

window.addEventListener("error", (event) => {
  const message = event.error?.message || event.message || "Error tidak dikenal";
  console.error("[meow-brawl] runtime error", event.error || event.message);
  // Only surface errors that actually break the page (a dead canvas is handled
  // by its own boundary), so normal 3D hiccups don't hide the menu.
  if (!document.querySelector(".mm-screen, .ml-screen, [data-screen]")) showFatal(message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[meow-brawl] unhandled rejection", event.reason);
});

const host = document.getElementById("root");
if (!host) {
  showFatal("Elemen #root tidak ditemukan.");
} else {
  try {
    createRoot(host).render(<App />);
  } catch (error) {
    showFatal(error instanceof Error ? error.message : String(error));
  }
}
