import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, onSnapshot, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let crewList = [];   // sorted crew profiles
let hcMap = {};      // healthCards keyed by crewId
let crewLoaded = false;
let hcLoaded = false;

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "login.html"; return; }
    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists() || userDoc.data().role !== "manager") {
            window.location.href = "login.html"; return;
        }
        startListeners();
    } catch (e) { console.error(e); }
});

function startListeners() {
    // Real-time listener on crewProfiles
    onSnapshot(collection(db, "crewProfiles"), snap => {
        crewList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        crewList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        crewLoaded = true;
        if (hcLoaded) renderGrid();
    });

    // Real-time listener on healthCards
    onSnapshot(collection(db, "healthCards"), snap => {
        hcMap = {};
        snap.forEach(d => { hcMap[d.id] = d.data(); });
        hcLoaded = true;
        if (crewLoaded) renderGrid();
    });
}

function renderGrid() {
    window._crewList = crewList;
    window._hcMap = hcMap;
    const grid = document.getElementById('crewCardsGrid');
    // Re-apply search filter if active
    const q = (document.getElementById('hcSearchInput')?.value || '').toLowerCase().trim();
    const list = q ? crewList.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.nickname || '').toLowerCase().includes(q)
    ) : crewList;
    let uploaded = 0, missing = 0;
    let html = '';

    list.forEach(c => {
        const hc = hcMap[c.id] || {};
        const hasHealth = !!hc.healthCardFrontBase64;
        const hasMeat = !!hc.meatHandlerBase64;

        if (hasHealth) uploaded++; else missing++;

        const borderColor = hasHealth ? '#10b981' : '#ef4444';
        const bgColor = hasHealth ? '#f0fdf4' : '#fff5f5';
        const badge = hasHealth
            ? `<span style="background:#dcfce7;color:#065f46;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">🟢 Uploaded</span>`
            : `<span style="background:#fee2e2;color:#991b1b;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">🔴 Missing</span>`;
        const meatBadge = hasMeat
            ? `<span style="background:#dcfce7;color:#065f46;padding:2px 8px;border-radius:20px;font-size:11px;">🥩 ✅</span>`
            : `<span style="background:#f3f4f6;color:#9ca3af;padding:2px 8px;border-radius:20px;font-size:11px;">🥩 —</span>`;

        html += `
            <div onclick="viewCrew('${c.id}','${(c.name||'').replace(/'/g,"\\'")}')"
                style="background:${bgColor};border:2px solid ${borderColor};border-radius:12px;padding:18px;cursor:pointer;transition:all 0.2s;box-shadow:0 2px 6px rgba(0,0,0,0.06);"
                onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 6px 16px rgba(0,0,0,0.12)'"
                onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 2px 6px rgba(0,0,0,0.06)'">
                <div style="font-weight:700;color:#DC0000;font-size:15px;margin-bottom:6px;">${c.name || 'Unknown'}</div>
                ${c.nickname ? `<div style="font-size:13px;color:#666;margin-bottom:8px;">"${c.nickname}"</div>` : ''}
                <div style="display:flex;gap:6px;flex-wrap:wrap;">${badge}${meatBadge}</div>
            </div>`;
    });

    grid.innerHTML = html || '<p style="color:#999;">No crew profiles found.</p>';
    document.getElementById('uploadedCount').textContent = uploaded;
    document.getElementById('missingCount').textContent = missing;
}

window.filterHealthCards = function() {
    renderGrid();
};

window.viewCrew = async function(crewId, name) {
    document.getElementById('modalCrewName').textContent = name;
    document.getElementById('modalHealthCard').innerHTML = '<p style="color:#999;">Loading...</p>';
    document.getElementById('modalMeatHandler').innerHTML = '<p style="color:#999;">Loading...</p>';
    document.getElementById('viewModal').style.display = 'flex';

    const hcDoc = await getDoc(doc(db, "healthCards", crewId));
    const data = hcDoc.exists() ? hcDoc.data() : {};

    const healthEl = document.getElementById('modalHealthCard');
    if (data.healthCardFrontBase64 || data.healthCardBackBase64) {
        let html = '';
        if (data.healthCardFrontBase64) {
            html += `<p style="font-weight:600;color:#555;margin:0 0 6px 0;font-size:13px;">Front Side</p>
            <img src="${data.healthCardFrontBase64}" alt="Front"
                style="max-width:100%;border-radius:10px;border:2px solid #e0e0e0;cursor:pointer;margin-bottom:14px;"
                onclick="openImgLightbox(this.src,'Health Card — Front')">`;
        }
        if (data.healthCardBackBase64) {
            html += `<p style="font-weight:600;color:#555;margin:0 0 6px 0;font-size:13px;">Back Side</p>
            <img src="${data.healthCardBackBase64}" alt="Back"
                style="max-width:100%;border-radius:10px;border:2px solid #e0e0e0;cursor:pointer;"
                onclick="openImgLightbox(this.src,'Health Card — Back')">`;
        }
        html += `<p style="color:#10b981;font-size:13px;margin-top:6px;">✅ Uploaded — click image to enlarge</p>`;
        healthEl.innerHTML = html;
    } else {
        healthEl.innerHTML = `<div style="padding:15px;background:#fee2e2;border-radius:8px;color:#991b1b;font-weight:600;">❌ Not uploaded yet</div>`;
    }

    const meatEl = document.getElementById('modalMeatHandler');
    if (data.meatHandlerBase64) {
        meatEl.innerHTML = `
            <img src="${data.meatHandlerBase64}" alt="Meat Handler"
                style="max-width:100%;border-radius:10px;border:2px solid #e0e0e0;cursor:pointer;"
                onclick="openImgLightbox(this.src,'Meat Handler Certificate')">
            <p style="color:#10b981;font-size:13px;margin-top:6px;">✅ Uploaded — click image to enlarge</p>`;
    } else {
        meatEl.innerHTML = `<div style="padding:15px;background:#f3f4f6;border-radius:8px;color:#9ca3af;">— Not uploaded (optional)</div>`;
    }
};

window.logout = async function() {
    if (!confirm("Are you sure you want to logout?")) return;
    await signOut(auth);
    window.location.replace("login.html");
};

window.printAllCards = function() {
    if (!crewLoaded || !hcLoaded) {
        alert('Data still loading, please wait a moment and try again.');
        return;
    }
    const uploaded = crewList.filter(c => hcMap[c.id] && hcMap[c.id].healthCardFrontBase64);
    if (uploaded.length === 0) {
        alert('No crew have uploaded health cards yet.');
        return;
    }

    const css = `
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: Arial, sans-serif; }
        .pp { width:100%; height:100vh; padding:20px 30px; page-break-after:always; display:flex; flex-direction:column; gap:12px; overflow:hidden; }
        .pp:last-child { page-break-after:avoid; }
        .ph { border-bottom:2px solid #DC0000; padding-bottom:8px; flex-shrink:0; }
        .pn { font-size:20px; font-weight:700; color:#DC0000; }
        .pk { font-size:13px; color:#555; margin-top:2px; }
        .pb { font-size:11px; color:#999; margin-top:3px; }
        .top-row { display:flex; gap:12px; flex:1; min-height:0; }
        .hc-col { display:flex; flex-direction:column; gap:6px; flex:1; min-height:0; }
        .meat-row { display:flex; flex-direction:column; gap:6px; flex:1; min-height:0; }
        .pl { font-size:12px; font-weight:700; color:#333; flex-shrink:0; }
        .pi { width:100%; flex:1; object-fit:contain; border:1px solid #ddd; border-radius:6px; min-height:0; }
        .pm { padding:10px; background:#fee2e2; color:#991b1b; border-radius:6px; font-size:12px; }
        .po { padding:10px; background:#f3f4f6; color:#9ca3af; border-radius:6px; font-size:12px; }
        @media print { .pp { page-break-after:always; height:100vh; } .pp:last-child { page-break-after:avoid; } }
    `;

    // Build HTML string safely
    let body = '';
    uploaded.forEach(c => {
        const hc = hcMap[c.id];
        body += '<div class="pp">';
        body += '<div class="ph">';
        body += '<div class="pn">' + (c.name || 'Unknown').replace(/</g,'&lt;') + '</div>';
        if (c.nickname) body += '<div class="pk">&quot;' + c.nickname.replace(/</g,'&lt;') + '&quot;</div>';
        body += '<div class="pb">EDSA Kamias Branch &mdash; Health Card Records</div>';
        body += '</div>';

        // Top row: Front | Back side by side
        body += '<div class="top-row">';
        body += '<div class="hc-col"><div class="pl">Health Card — Front</div>';
        if (hc.healthCardFrontBase64) body += '<img class="pi" src="' + hc.healthCardFrontBase64 + '">';
        else body += '<div class="pm">Not uploaded</div>';
        body += '</div>';
        body += '<div class="hc-col"><div class="pl">Health Card — Back</div>';
        if (hc.healthCardBackBase64) body += '<img class="pi" src="' + hc.healthCardBackBase64 + '">';
        else body += '<div class="pm">Not uploaded</div>';
        body += '</div>';
        body += '</div>';

        // Bottom: Meat Handler full width
        body += '<div class="meat-row"><div class="pl">Meat Handler Certificate</div>';
        if (hc.meatHandlerBase64) body += '<img class="pi" src="' + hc.meatHandlerBase64 + '">';
        else body += '<div class="po">Not uploaded (optional)</div>';
        body += '</div>';

        body += '</div>'; // end page
    });

    // Remove any existing print iframe
    const existing = document.getElementById('_printFrame');
    if (existing) existing.remove();

    const iframe = document.createElement('iframe');
    iframe.id = '_printFrame';
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;';
    document.body.appendChild(iframe);

    const idoc = iframe.contentDocument || iframe.contentWindow.document;
    idoc.open();
    idoc.write('<!DOCTYPE html><html><head><style>' + css + '</style></head><body>' + body + '</body></html>');
    idoc.close();

    iframe.onload = function() {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => iframe.remove(), 1000);
    };
};
