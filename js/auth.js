import { auth } from "./firebase-config.js";
import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
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

        // Check if user has been deleted (optional - handle permission errors gracefully)
        try {
            const deletedUserDoc = await getDoc(doc(db, "deletedUsers", user.uid));
            if (deletedUserDoc.exists()) {
                // Sign out the user immediately
                await auth.signOut();
                loginBtn.classList.remove("loading");
                loginBtn.disabled = false;
                alert("❌ This account has been deactivated. Please contact your manager.");
                return;
            }

            // Also check by email as fallback
            const deletedByEmailDoc = await getDoc(doc(db, "deletedUsers", user.email));
            if (deletedByEmailDoc.exists()) {
                // Sign out the user immediately
                await auth.signOut();
                loginBtn.classList.remove("loading");
                loginBtn.disabled = false;
                alert("❌ This account has been deactivated. Please contact your manager.");
                return;
            }
        } catch (deletedUserError) {
            // Ignore permission errors for deletedUsers collection - it may not exist yet
            console.log("Could not check deleted users (this is normal if collection doesn't exist):", deletedUserError.message);
        }

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