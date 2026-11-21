
import { auth } from "./firebase.js";
import { login } from "./auth.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("loginButton");
const errorBox = document.getElementById("loginError");
const togglePassword = document.getElementById("togglePassword");

// Redirect an already signed-in user
onAuthStateChanged(auth, user => {
    if (user) {
        window.location.replace("home.html");
    }
});

// Show or hide password
togglePassword.addEventListener("click", () => {
    const hidden = passwordInput.type === "password";

    passwordInput.type = hidden ? "text" : "password";
    togglePassword.textContent = hidden ? "🙈" : "👁️";
});

// Login
form.addEventListener("submit", async event => {
    event.preventDefault();

    errorBox.textContent = "";

    loginButton.disabled = true;
    loginButton.textContent = "Entering our world...";

    try {
        await login(
            emailInput.value,
            passwordInput.value
        );

        window.location.replace("home.html");

    } catch (error) {
        console.error("Login error:", error);

        const messages = {
            "auth/invalid-credential":
                "Incorrect email or password.",

            "auth/user-not-found":
                "This account does not exist.",

            "auth/wrong-password":
                "Incorrect password.",

            "auth/too-many-requests":
                "Too many attempts. Please try again later.",

            "auth/network-request-failed":
                "Network error. Check your internet connection."
        };

        errorBox.textContent =
            messages[error.code] ||
            error.message ||
            "Login failed. Please try again.";

        loginButton.disabled = false;
        loginButton.textContent = "Enter Our World 💜";
    }
});
