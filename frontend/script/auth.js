const poolData = {
  UserPoolId: "us-west-2_CaC4wWgAg",
  ClientId: "2pmt80caeqtkqaucg5t2ja1tm2"
};

const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');
const authButton = document.getElementById('authButton');
const switchText = document.getElementById('switchText');
const switchLink = document.getElementById('switchLink');

const authForm = document.getElementById("authForm");
const confirmForm = document.getElementById("confirmForm");

const authMessage = document.getElementById("authMessage");
const confirmMessage = document.getElementById("confirmMessage");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const codeInput = document.getElementById("code");


let isLoginMode = true;
let pendingEmail = "";

switchLink.addEventListener('click', (event) => {
    event.preventDefault();
    isLoginMode = !isLoginMode;

    clearMessages();
    resetAuthForm();
    resetConfirmForm();
    updateForm();
});

function updateForm() {
    if (isLoginMode) {
        authTitle.textContent = "Login to Your Account";
        authSubtitle.textContent = "Enter your email and password to continue.";
        authButton.textContent = "Login";
        switchText.textContent = "Don't have an account?";
        switchLink.textContent = "Sign Up";
    } else {
        authTitle.textContent = "Create Your Account";
        authSubtitle.textContent = "Enter your email and password to create an account.";
        authButton.textContent = "Sign Up";
        switchText.textContent = "Already have an account?";
        switchLink.textContent = "Login";
    }
}

authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessages();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
        showAuthError("Please enter both email and password.");
        return;
    }

    if (isLoginMode) {
       loginUser(email, password);
    } else {
        signUpUser(email, password);
    }    
});

confirmForm.addEventListener("submit", function (event) {
    event.preventDefault();

    clearMessages();
    resetAuthForm();

    const code = codeInput.value.trim();

    if (!code) {
        showConfirmError("Please enter the confirmation code.");
        return;
    }

    showConfirmSuccess("Account confirmed. You can now log in.");

    confirmUser(code);

});

function loginUser(email, password) {
    const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails({
        Username: email,
        Password: password
    });

    const userData = {
        Username: email,
        Pool: userPool
    };

    const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

    cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: function (result) {
            const idToken = result.getIdToken().getJwtToken();
            const accessToken = result.getAccessToken().getJwtToken();
            const refreshToken = result.getRefreshToken().getToken();

            localStorage.setItem("idToken", idToken);
            localStorage.setItem("accessToken", accessToken);
            localStorage.setItem("refreshToken", refreshToken);
            localStorage.setItem("userEmail", email);

            showAuthSuccess("Login successful.");
            setTimeout(() => {
                const next = new URLSearchParams(window.location.search).get("next") || "index.html";
                window.location.href = next;
            }, 800);
        },
        onFailure: function (err) {
            showAuthError(err.message || JSON.stringify(err));
        }
    });
}       

function confirmUser(code) {
    const userData = {
        Username: pendingEmail,
        Pool: userPool
    };
    const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

    cognitoUser.confirmRegistration(code, true, function (err, result) {
        if (err) {
            showConfirmError(err.message || JSON.stringify(err));
            return;
        }
        showConfirmSuccess("Account confirmed. You can now log in.");

        setTimeout(() => {
            confirmForm.classList.add("hidden");
            authForm.classList.remove("hidden");

            isLoginMode = true;
            authTitle.textContent = "Login";
            authSubtitle.textContent = "Enter your email and password to continue.";
            authButton.textContent = "Login";
            switchText.textContent = "Don't have an account?";
            switchLink.textContent = "Sign Up";

            resetConfirmForm();
            resetAuthForm();
            
            authMessage.textContent = "Account confirmed. Please log in.";
            authMessage.className = "message show success";

            confirmMessage.textContent = "";
            confirmMessage.className = "message";
        }, 800);
    });
}

function signUpUser(email, password) {
    const attributeList = [];
    const emailAttribute = new AmazonCognitoIdentity.CognitoUserAttribute({
        Name: "email",
        Value: email
    });
    attributeList.push(emailAttribute);
    userPool.signUp(email, password, attributeList, null, function (err, result) {
        if (err) {
            showAuthError(err.message || JSON.stringify(err));
            return;
        }  

        pendingEmail = email;
        showAuthSuccess("Sign up successful! Please check your email for the confirmation code.");

        setTimeout(() => {
            authForm.classList.add("hidden");
            confirmForm.classList.remove("hidden");

            authTitle.textContent = "Confirm Your Account";
            authSubtitle.textContent = "Enter the confirmation code sent to your email.";
            resetConfirmForm();
        }, 500);
    });
}

function resetAuthForm() {
    document.getElementById("email").value = "";
    document.getElementById("password").value = "";
}

function resetConfirmForm() {
    document.getElementById("code").value = "";
}

function clearMessages() {
    authMessage.textContent = "";
    authMessage.className = "messgae";

    confirmMessage.textContent = "";
    confirmMessage.className = "message";
}

function showAuthError(msg) {
    authMessage.textContent = msg;
    authMessage.className = "message show error";
}

function showAuthSuccess(msg) {
    authMessage.textContent = msg;
    authMessage.className = "message show success";
}

function showConfirmError(msg) {
    confirmMessage.textContent = msg;
    confirmMessage.className = "message show error";
}

function showConfirmSuccess(msg) {
    confirmMessage.textContent = msg;
    confirmMessage.className = "message show success";
}