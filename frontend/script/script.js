function getCurrentFile() {
  const cleanedPath = window.location.pathname.replace(/\/+$/, "");
  const lastSegment = cleanedPath.split("/").pop();
  return lastSegment || "index.html";
}

function markActiveMenuLink(menuContainer, currentFile) {
  const links = menuContainer.querySelectorAll("a[href]");

  links.forEach((link) => {
    const href = link.getAttribute("href");
    if (!href) return;

    const cleanedHref = href.replace(/^\.\//, "");
    if (cleanedHref === currentFile) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const currentFile = getCurrentFile().toLowerCase();
  const isLoginPage = currentFile === "login" || currentFile === "login.html";
  if (isLoginPage) return;

  const menuContainer = document.getElementById("menu");
  if (!menuContainer) return;

  try {
    const response = await fetch("./component/menu.html");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    menuContainer.innerHTML = await response.text();
    markActiveMenuLink(menuContainer, currentFile);
  } catch (error) {
    console.error("Unable to load menu:", error);
  }
});
