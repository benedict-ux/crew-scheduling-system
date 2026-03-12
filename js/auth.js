import { auth } from "./firebase-config.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";

window.login = async function() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const loginBtn = document.getElementById("loginBtn");

    // Validate inputs
    if (!email || !password) {
        alert("❌ Please enter both email and password.");
        return;
    }

    // Show loading spinner
    loginBtn.classList.add("loading");
    loginBtn.disabled = true;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        const docSnap = await getDoc(doc(db, "users", user.uid));

        if (docSnap.exists()) {
            const role = docSnap.data().role;

            // Redirect based on role
            if (role === "manager") {
                window.location.replace("manager.html");
            } else {
                window.location.replace("crew.html");
            }
        } else {
            // Hide loading spinner
            loginBtn.classList.remove("loading");
            loginBtn.disabled = false;
            alert("❌ User account not found. Please contact your manager.");
        }
    } catch (error) {
        // Hide loading spinner
        loginBtn.classList.remove("loading");
        loginBtn.disabled = false;
        
        // Better error messages
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            alert("❌ Invalid email or password. Please try again.");
        } else if (error.code === 'auth/user-not-found') {
            alert("❌ No account found with this email.");
        } else if (error.code === 'auth/too-many-requests') {
            alert("❌ Too many failed login attempts. Please try again later.");
        } else {
            alert("❌ Login failed: " + error.message);
        }
    }
}