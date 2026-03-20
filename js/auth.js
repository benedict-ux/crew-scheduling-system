import { auth } from "./firebase-config.js";
import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";

// Show loading indicator during login
function showLoginLoading(show = true) {
    const loginBtn = document.getElementById("loginBtn");
    if (loginBtn) loginBtn.disabled = show;

    // Reuse the full-page loading overlay
    let overlay = document.getElementById("loginLoadingOverlay");
    if (show) {
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "loginLoadingOverlay";
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: linear-gradient(135deg, #DC0000 0%, #B00000 50%, #8B0000 100%);
                display: flex; flex-direction: column;
                justify-content: center; align-items: center;
                z-index: 9999; color: white;
            `;
            overlay.innerHTML = `
                <div style="
                    width: 60px; height: 60px;
                    border: 4px solid rgba(255,199,0,0.3);
                    border-top: 4px solid #FFC700;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 25px;
                "></div>
                <div style="font-size: 20px; font-weight: 600; margin-bottom: 10px;">🍔 Signing In...</div>
                <div style="font-size: 14px; opacity: 0.8;">Please wait...</div>
                <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
            `;
            document.body.appendChild(overlay);
        }
        overlay.style.display = "flex";
    } else {
        if (overlay) {
            overlay.style.opacity = "0";
            overlay.style.transition = "opacity 0.2s";
            setTimeout(() => overlay.remove(), 200);
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
                await auth.signOut();
                showLoginLoading(false);
                alert("❌ This account has been deactivated. Please contact your manager.");
                return;
            }

            // Also check by email as fallback
            const deletedByEmailDoc = await getDoc(doc(db, "deletedUsers", user.email));
            if (deletedByEmailDoc.exists()) {
                await auth.signOut();
                showLoginLoading(false);
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

            // Keep overlay visible during redirect
            if (role === "manager") {
                window.location.replace("manager.html");
            } else {
                window.location.replace("crew.html");
            }
        } else {
            showLoginLoading(false);
            alert("❌ User account not found. Please contact your manager.");
        }
    } catch (error) {
        // Hide loading spinner
        showLoginLoading(false);

        // Clear fields on any error
        document.getElementById("email").value = "";
        document.getElementById("password").value = "";
        document.getElementById("email").focus();
        
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