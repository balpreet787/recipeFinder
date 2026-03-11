function updateAuthLink() {

  const authLink = document.getElementById("authLink");

  if (!authLink) return;

  const token = localStorage.getItem("idToken");

  if (token) {

    authLink.textContent = "Logout";
    authLink.href = "#";

    authLink.addEventListener("click", function (e) {
      e.preventDefault();

      localStorage.removeItem("idToken");
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("userEmail");

      window.location.href = "index.html";
    });

  } else {

    authLink.textContent = "Login";
    authLink.href = "login.html";

  }

}