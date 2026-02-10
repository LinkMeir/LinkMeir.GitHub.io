// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDwofGCJUWkdLGWyXK7_UBAbbC39FXnAmI",
    authDomain: "linkmeir-dada4.firebaseapp.com",
    projectId: "linkmeir-dada4",
    storageBucket: "linkmeir-dada4.firebasestorage.app",
    messagingSenderId: "933486826829",
    appId: "1:933486826829:web:6e61498d88a55623c65304",
    measurementId: "G-46D3WMVFK5"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();