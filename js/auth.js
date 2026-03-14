import { auth } from "./firebase-config.js";
import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";

// Show loading indicator during login
function showLoginLoading(show = true) {
    const loginBtn = document.getElementById("loginBtn");
    if (loginBtn) {
        if (show) {
            loginBtn.classList.add("loading");
            loginBtn.disabled = true;
            loginBtn.textContent = "Signing In...";
        } else {
            loginBtn.classList.remove("loading");
            loginBtn.disabled = false;
            loginBtn.textContent = "Sign In";
        }
    }
}

window.login = async function() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    // Validate inputs
    if (!email || !password) {
        alert("❌ Please enter both email and password.");
        return;
    }

    // Show loading with better UX
    showLoginLoading(true);

    try {
        // Add timeout for slow connections
        const loginPromise = signInWithEmailAndPassword(auth, email, password);
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout')), 15000)
        );

        const userCredential = await Promise.race([loginPromise, timeoutPromise]);
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
            showLoginLoading(false);
            alert("❌ User account not found. Please contact your manager.");
        }
    } catch (error) {
        // Hide loading spinner
        showLoginLoading(false);
        
        // Better error messages for mobile users
        if (error.message === 'Connection timeout') {
            alert("❌ Connection timeout. Please check your internet connection and try again.");
        } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            alert("❌ Invalid email or password. Please try again.");
        } else if (error.code === 'auth/user-not-found') {
            alert("❌ No account found with this email.");
        } else if (error.code === 'auth/too-many-requests') {
            alert("❌ Too many failed login attempts. Please try again later.");
        } else if (error.code === 'auth/network-request-failed') {
            alert("❌ Network error. Please check your internet connection.");
        } else {
            alert("❌ Login failed: " + error.message);
        }
    }
}