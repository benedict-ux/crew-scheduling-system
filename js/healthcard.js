import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, updateDoc, getDocs, collection, query, where, setDoc, deleteField, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentCrewId = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "login.html"; return; }
    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists()) { window.location.href = "login.html"; return; }
        if (userDoc.data().role === "manager") { window.location.href = "manager.html"; return; }

        const crewName = userDoc.data().name;

        // Try uid first, then email, then name
        let crewSnap = await getDocs(query(collection(db, "crewProfiles"), where("uid", "==", user.uid)));
        if (crewSnap.empty) {
            crewSnap = await getDocs(query(collection(db, "crewProfiles"), where("email", "==", user.email)));
        }
        if (crewSnap.empty && crewName) {
            crewSnap = await getDocs(query(collection(db, "crewProfiles"), where("name", "==", crewName)));
        }
        if (crewSnap.empty) {
            showStatus('❌ No crew profile found. Contact your manager.', '#fee2e2', '#991b1b');
            return;
        }

        currentCrewId = crewSnap.docs[0].id;
        console.log("✅ Crew ID:", currentCrewId);

        // Load existing uploads from healthCards collection
        const hcDoc = await getDoc(doc(db, "healthCards", currentCrewId));
        if (hcDoc.exists()) {
            const data = hcDoc.data();
            if (data.healthCardFrontBase64) showPreview('healthCardFront', data.healthCardFrontBase64);
            if (data.healthCardBackBase64) showPreview('healthCardBack', data.healthCardBackBase64);
            if (data.meatHandlerBase64) showPreview('meatHandler', data.meatHandlerBase64);
        }
    } catch (e) {
        console.error("Error loading:", e);
        showStatus('❌ Error: ' + e.message, '#fee2e2', '#991b1b');
    }
});

// Compress image to base64, max 800px wide, 70% quality
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxW = 800;
                const scale = img.width > maxW ? maxW / img.width : 1;
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const base64 = canvas.toDataURL('image/jpeg', 0.7);
                // Check size (~750KB limit to stay under 1MB doc limit)
                const sizeKB = Math.round((base64.length * 3) / 4 / 1024);
                console.log(`Compressed image: ${sizeKB}KB`);
                if (sizeKB > 750) {
                    // Try harder compression
                    resolve(canvas.toDataURL('image/jpeg', 0.4));
                } else {
                    resolve(base64);
                }
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function showPreview(type, base64) {
    document.getElementById(`${type}Img`).src = base64;
    document.getElementById(`${type}Preview`).style.display = 'block';
    document.getElementById(`${type}Empty`).style.display = 'none';
    // Show re-upload/delete, hide initial choose file
    document.getElementById(`${type}ChooseBtn`).style.display = 'none';
    document.getElementById(`${type}ReuploadBtn`).style.display = 'inline-block';
    document.getElementById(`${type}DeleteBtn`).style.display = 'inline-block';
}

function hidePreview(type) {
    document.getElementById(`${type}Preview`).style.display = 'none';
    document.getElementById(`${type}Empty`).style.display = 'block';
    document.getElementById(`${type}ChooseBtn`).style.display = 'inline-block';
    document.getElementById(`${type}ReuploadBtn`).style.display = 'none';
    document.getElementById(`${type}DeleteBtn`).style.display = 'none';
    document.getElementById(`${type}UploadBtn`).style.display = 'none';
    document.getElementById(`${type}FileName`).textContent = '';
}

window.previewFile = function(type) {
    const input = document.getElementById(`${type}File`);
    if (!input.files[0]) return;
    document.getElementById(`${type}FileName`).textContent = input.files[0].name;
    document.getElementById(`${type}UploadBtn`).style.display = 'inline-block';
};

window.triggerReupload = function(type) {
    document.getElementById(`${type}File`).click();
};

window.deleteFile = async function(type) {
    if (!confirm(`Are you sure you want to delete your ${type === 'healthCard' ? 'Health Card' : 'Meat Handler Certificate'}? This cannot be undone.`)) return;
    if (!currentCrewId) return;

    const field = type === 'healthCardFront' ? 'healthCardFrontBase64'
                : type === 'healthCardBack'  ? 'healthCardBackBase64'
                : 'meatHandlerBase64';
    const allFields = ['healthCardFrontBase64', 'healthCardBackBase64', 'meatHandlerBase64'];
    try {
        // Check if any other field still has data
        const hcDoc = await getDoc(doc(db, "healthCards", currentCrewId));
        const data = hcDoc.exists() ? hcDoc.data() : {};
        const othersHaveData = allFields.filter(f => f !== field).some(f => !!data[f]);

        if (othersHaveData) {
            await updateDoc(doc(db, "healthCards", currentCrewId), { [field]: deleteField() });
        } else {
            await deleteDoc(doc(db, "healthCards", currentCrewId));
        }

        hidePreview(type);
        showStatus('🗑️ Deleted successfully.', '#fff3cd', '#856404');
    } catch (e) {
        console.error(e);
        showStatus('❌ Delete failed: ' + e.message, '#fee2e2', '#991b1b');
    }
};

window.uploadFile = async function(type) {
    const input = document.getElementById(`${type}File`);
    const file = input.files[0];
    if (!file || !currentCrewId) {
        if (!currentCrewId) showStatus('❌ Profile not loaded yet. Please wait or refresh.', '#fee2e2', '#991b1b');
        return;
    }

    const btn = document.getElementById(`${type}UploadBtn`);
    btn.disabled = true;
    btn.textContent = '⏳ Compressing...';
    showStatus('Compressing image...', '#e7f3ff', '#1565c0');

    try {
        const base64 = await compressImage(file);
        const sizeKB = Math.round((base64.length * 3) / 4 / 1024);

        btn.textContent = '⏳ Saving...';
        showStatus(`Saving (${sizeKB}KB)...`, '#e7f3ff', '#1565c0');

        const field = type === 'healthCardFront' ? 'healthCardFrontBase64'
                    : type === 'healthCardBack'  ? 'healthCardBackBase64'
                    : 'meatHandlerBase64';
        await setDoc(doc(db, "healthCards", currentCrewId), {
            [field]: base64,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        showPreview(type, base64);
        document.getElementById(`${type}FileName`).textContent = '';
        btn.style.display = 'none';
        btn.disabled = false;
        btn.textContent = '⬆️ Upload';
        showStatus(`✅ Saved! (${sizeKB}KB)`, '#dcfce7', '#065f46');
    } catch (e) {
        console.error(e);
        btn.disabled = false;
        btn.textContent = '⬆️ Upload';
        showStatus('❌ Failed: ' + e.message, '#fee2e2', '#991b1b');
    }
};

function showStatus(msg, bg, color) {
    let el = document.getElementById('uploadStatus');
    if (!el) return;
    el.style.cssText = `
        display:block;
        position:fixed;
        top:20px;
        left:50%;
        transform:translateX(-50%) translateY(-80px);
        background:${bg};
        color:${color};
        padding:14px 24px;
        border-radius:10px;
        font-weight:600;
        font-size:15px;
        box-shadow:0 4px 20px rgba(0,0,0,0.2);
        z-index:99999;
        transition:transform 0.3s ease;
        white-space:nowrap;
        max-width:90vw;
        text-align:center;
    `;
    el.textContent = msg;
    // Slide in
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            el.style.transform = 'translateX(-50%) translateY(0)';
        });
    });
    const autoHide = msg.startsWith('✅') || msg.startsWith('🗑️') || msg.startsWith('❌');
    if (autoHide) {
        setTimeout(() => {
            el.style.transform = 'translateX(-50%) translateY(-80px)';
            setTimeout(() => { el.style.display = 'none'; }, 300);
        }, 3000);
    }
}

window.logout = async function() {
    if (!confirm("Are you sure you want to logout?")) return;
    await signOut(auth);
    window.location.replace("login.html");
};
