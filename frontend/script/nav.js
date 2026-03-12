function getCurrentFile() {
  const cleanedPath = window.location.pathname.replace(/\/+$/, "");
  const lastSegment = cleanedPath.split("/").pop();
  return (lastSegment || "index.html").toLowerCase();
}

function isLoginPage(currentFile) {
  return currentFile === "login" || currentFile === "login.html";
}

function clearAuthStorage() {
  localStorage.removeItem("idToken");
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("userEmail");
}

function decodeJwtPayload(token) {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;

    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const normalized = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");

    return JSON.parse(atob(normalized));
  } catch {
    return null;
  }
}

function hasValidSession() {
  const token = localStorage.getItem("idToken");
  if (!token) return false;

  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") {
    clearAuthStorage();
    return false;
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowInSeconds) {
    clearAuthStorage();
    return false;
  }

  return true;
}

function redirectToLogin(currentFile = getCurrentFile()) {
  const nextTarget = encodeURIComponent(currentFile || "index.html");
  window.location.replace(`login.html?next=${nextTarget}`);
}

function markActiveMenuLink(menuContainer, currentFile) {
  const links = menuContainer.querySelectorAll("a[href]");

  links.forEach((link) => {
    const href = link.getAttribute("href");
    if (!href) return;

    const cleanedHref = href.replace(/^\.\//, "").toLowerCase();
    if (cleanedHref === currentFile) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    }
  });
}

function updateAuthLink() {
  const authLink = document.getElementById("authLink");
  if (!authLink) return;

  if (hasValidSession()) {
    authLink.textContent = "Logout";
    authLink.href = "#";

    authLink.addEventListener("click", function (event) {
      event.preventDefault();
      clearAuthStorage();
      window.location.replace("login.html");
    });
    return;
  }

  authLink.textContent = "Login";
  authLink.href = "login.html";
}

document.addEventListener("DOMContentLoaded", async () => {
  const currentFile = getCurrentFile();
  const onLoginPage = isLoginPage(currentFile);
  const authenticated = hasValidSession();

  if (!onLoginPage && !authenticated) {
    redirectToLogin(currentFile);
    return;
  }

  if (onLoginPage) {
    if (authenticated) {
      const next = new URLSearchParams(window.location.search).get("next") || "index.html";
      window.location.replace(next);
    }
    return;
  }

  const menuContainer = document.getElementById("menu");
  if (!menuContainer) return;

  try {
    const response = await fetch("./component/menu.html");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    menuContainer.innerHTML = await response.text();
    markActiveMenuLink(menuContainer, currentFile);
    updateAuthLink();
  } catch (error) {
    console.error("Unable to load menu:", error);
  }
});
