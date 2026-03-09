// Firebase SDK imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDBFGMiC11DNiKR2H6Yy8Zxm3g6q7c8uoE",
  authDomain: "crewflow-edsa-kamias.firebaseapp.com",
  projectId: "crewflow-edsa-kamias",
  storageBucket: "crewflow-edsa-kamias.firebasestorage.app",
  messagingSenderId: "1060044755700",
  appId: "1:1060044755700:web:388f3e5d8a1f7bdce644a1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);