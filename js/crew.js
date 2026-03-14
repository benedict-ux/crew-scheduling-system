import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    getDoc, 
    doc, 
    collection, 
    query, 
    where, 
    orderBy, 
    limit, 
    getDocs, 
    addDoc,          // Added this
    serverTimestamp, // Added this
    deleteDoc        // Added for deleting past requests
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
let currentCrewName = "";
let currentCrewNickname = "";

// ===============================
// 2. NAVIGATION LOGIC (MOVED TO TOP)
// ===============================
window.showSection = function(section) {
    console.log('showSection called with:', section);
    
    const personalDiv = document.getElementById('personalSection');
    const globalDiv = document.getElementById('globalSection');
    const requestDiv = document.getElementById('requestSection');

    console.log('Elements found:', {
        personalDiv: !!personalDiv,
        globalDiv: !!globalDiv,
        requestDiv: !!requestDiv
    });

    // Hide all sections first
    if(personalDiv) {
        personalDiv.style.display = 'none';
        console.log('Personal section hidden');
    }
    if(globalDiv) {
        globalDiv.style.display = 'none';
        console.log('Global section hidden');
    }
    if(requestDiv) {
        requestDiv.style.display = 'none';
        console.log('Request section hidden');
    }

    // Show selected section
    if (section === 'personal') {
        console.log('Showing personal section');
        if (personalDiv) {
            personalDiv.style.display = 'block';
            console.log('Personal section display set to block');
        }
        loadMyPersonalSchedule(currentCrewName);
    } else if (section === 'global') {
        console.log('Showing global section');
        if (globalDiv) {
            globalDiv.style.display = 'block';
            console.log('Global section display set to block');
        }
        loadGlobalSchedule();
    } else if (section === 'request') {
        console.log('Showing request section');
        if (requestDiv) {
            requestDiv.style.display = 'block';
            console.log('Request section display set to block');
        }
        loadMyRequestHistory();
    }
    
    console.log('Final display states:', {
        personal: personalDiv ? personalDiv.style.display : 'not found',
        global: globalDiv ? globalDiv.style.display : 'not found',
        request: requestDiv ? requestDiv.style.display : 'not found'
    });
};

// ===============================
// 1. AUTH & INITIALIZATION
// ===============================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Check if user has been deleted (optional - handle permission errors gracefully)
        try {
            const deletedUserDoc = await getDoc(doc(db, "deletedUsers", user.uid));
            if (deletedUserDoc.exists()) {
                await signOut(auth);
                alert("❌ This account has been deactivated. Please contact your manager.");
                window.location.replace("login.html");
                return;
            }
            
            // Also check by email as fallback
            const deletedByEmailDoc = await getDoc(doc(db, "deletedUsers", user.email));
            if (deletedByEmailDoc.exists()) {
                await signOut(auth);
                alert("❌ This account has been deactivated. Please contact your manager.");
                window.location.replace("login.html");
                return;
            }
        } catch (deletedUserError) {
            // Ignore permission errors for deletedUsers collection - it may not exist yet
            console.log("Could not check deleted users (this is normal if collection doesn't exist):", deletedUserError.message);
        }
        
        // Prevent back button - if user tries to go back, redirect to current page
        const currentPage = window.location.href;
        
        // Replace current history entry
        window.history.replaceState(null, null, currentPage);
        
        // Listen for back button
        window.addEventListener('popstate', function(event) {
            // Immediately redirect back to crew page
            window.location.replace('crew.html');
        });
        
        console.log("User logged in:", user.email, "UID:", user.uid);
        
        try {
            // Load user data and crew profile in parallel
            const [docSnap] = await Promise.all([
                getDoc(doc(db, "users", user.uid))
            ]);
            
            if (docSnap.exists()) {
                const userData = docSnap.data();
                currentCrewName = userData.name;
                
                console.log("Crew name loaded:", currentCrewName);
                
                // Load crew profile to find nickname
                const crewProfileQuery = query(
                    collection(db, "crewProfiles"),
                    where("name", "==", currentCrewName),
                    limit(1)
                );
                const crewProfileSnap = await getDocs(crewProfileQuery);
                if (!crewProfileSnap.empty) {
                    const crewProfile = crewProfileSnap.docs[0].data();
                    currentCrewNickname = crewProfile.nickname || "";
                    console.log("Crew nickname loaded:", currentCrewNickname);
                }
                
                // Default view
                window.showSection('personal');
                
                // Test if showSection is accessible
                console.log('showSection function is:', typeof window.showSection);
                console.log('Testing showSection function...');
                
                // Add click listener to Full Team Schedule link for debugging
                setTimeout(() => {
                    const globalLink = document.querySelector('a[onclick*="global"]');
                    console.log('Full Team Schedule link found:', !!globalLink);
                    if (globalLink) {
                        globalLink.addEventListener('click', function(e) {
                            console.log('Full Team Schedule link clicked!');
                        });
                    }
                }, 100);
            } else {
                console.error("No user document found for UID:", user.uid);
                alert("❌ Your account is not set up properly. Please contact your manager.\n\nEmail: " + user.email);
            }
        } catch (error) {
            console.error("Error loading user data:", error);
            alert("❌ Error loading your profile. Please try again.");
        }
    } else {
        window.location.href = "login.html";
    }
});

// ===============================
// 3. SCHEDULE LOADERS
// ===============================
async function loadMyPersonalSchedule(crewName) {
    const container = document.getElementById("personalSchedule");
    if (!container) return;

    const q = query(collection(db, "weeklySchedules"), where("status", "==", "published"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    
    if (snap.empty) {
        container.innerHTML = `
            <h2 style="color: #DC0000; margin-bottom: 20px;">Welcome, ${crewName}! 👋</h2>
            <div class='card' style='background: #fff3cd; border-left: 4px solid #ffc107; padding: 20px;'>
                <h3 style='color: #856404; margin-bottom: 10px;'>📅 No Published Schedule</h3>
                <p style='color: #856404;'>The manager hasn't published a schedule yet. Please check back later or contact your manager.</p>
            </div>
        `;
        return;
    }

    // Find the first non-archived schedule
    let scheduleData = null;
    for (const doc of snap.docs) {
        if (!doc.data().archived) {
            scheduleData = doc.data().scheduleData;
            break;
        }
    }

    if (!scheduleData) {
        container.innerHTML = `
            <h2 style="color: #DC0000; margin-bottom: 20px;">Welcome, ${crewName}! 👋</h2>
            <div class='card' style='background: #fff3cd; border-left: 4px solid #ffc107; padding: 20px;'>
                <h3 style='color: #856404; margin-bottom: 10px;'>📅 No Active Schedule</h3>
                <p style='color: #856404;'>All schedules have been archived. Please wait for the manager to publish a new schedule.</p>
            </div>
        `;
        return;
    }

    let html = `<h2 style="color: #DC0000; margin-bottom: 20px;">Welcome, ${crewName}! 👋</h2>`;
    let found = false;

    // Extract first name and last name for matching (handles "Last, First Middle" format)
    let firstName = crewName;
    let lastName = crewName;
    
    if (crewName.includes(',')) {
        // "De Guzman, Jackielyn" -> lastName: "De Guzman", firstName: "Jackielyn"
        const parts = crewName.split(',');
        lastName = parts[0].trim(); // "De Guzman"
        const afterComma = parts[1].trim(); // "Jackielyn"
        firstName = afterComma.split(' ')[0]; // Get just the first name "Jackielyn"
    }

    console.log(`Crew name: ${crewName}, First name: ${firstName}, Last name: ${lastName}, Nickname: ${currentCrewNickname}`);

    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].forEach(day => {
        // Debug: Log all crew names in this day's schedule
        console.log(`${day} schedule:`, scheduleData[day].map(s => s.crewName));
        
        // Match by first name, last name, full name, nickname, or contains any of these
        const myShifts = scheduleData[day].filter(s => {
            const scheduleName = s.crewName || "";
            const scheduleNameLower = scheduleName.toLowerCase();
            
            // Check multiple matching options
            const matches = scheduleName === firstName || 
                           scheduleName === lastName ||
                           scheduleName === crewName || 
                           (currentCrewNickname && scheduleName === currentCrewNickname) ||
                           scheduleNameLower.includes(firstName.toLowerCase()) ||
                           scheduleNameLower.includes(lastName.toLowerCase()) ||
                           (currentCrewNickname && scheduleNameLower.includes(currentCrewNickname.toLowerCase()));
            
            if (matches) {
                console.log(`✅ Found match: "${scheduleName}" matches crew on ${day}`);
            }
            return matches;
        });
        
        if (myShifts.length > 0) {
            found = true;
            html += `<div class="card" style="border-left: 5px solid #2563eb; margin-bottom: 10px; padding: 15px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <h3>${day}</h3>
                        ${myShifts.map(s => `<p><strong>${s.station}</strong>: ${s.startTime} - ${s.endTime}</p>`).join("")}
                     </div>`;
        }
    });
    
    // Always show the welcome message with the crew name
    if (!found) {
        html += `<div class="card" style="border-left: 5px solid #ffc107; margin-bottom: 10px; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <p style="color: #856404; font-size: 16px; margin: 0;">📅 You don't have any shifts scheduled this week.</p>
                    <p style="color: #666; font-size: 14px; margin-top: 10px;">Check back later or contact your manager if you think this is a mistake.</p>
                 </div>`;
    }
    
    container.innerHTML = html;
}

async function loadGlobalSchedule() {
    const container = document.getElementById("globalScheduleContainer");
    if (!container) return;

    container.innerHTML = "Loading schedule...";

    try {
        const q = query(collection(db, "weeklySchedules"), where("status", "==", "published"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        if (snap.empty) {
            container.innerHTML = "<p>No schedule published yet.</p>";
            return;
        }

        // Find the first non-archived schedule
        let scheduleDoc = null;
        let scheduleStartDate = null;
        for (const doc of snap.docs) {
            if (!doc.data().archived) {
                scheduleDoc = doc.data();
                scheduleStartDate = doc.data().startDate;
                break;
            }
        }

        if (!scheduleDoc) {
            container.innerHTML = "<p>No active schedule available.</p>";
            return;
        }

        const scheduleData = scheduleDoc.scheduleData;
        const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        
        container.innerHTML = "";

        days.forEach((day, dayIndex) => {
            // Calculate date for this day
            const parts = scheduleStartDate.split("-");
            const baseDate = new Date(parts[0], parts[1] - 1, parts[2]);
            const currentDayObj = new Date(baseDate);
            currentDayObj.setDate(baseDate.getDate() + dayIndex);
            const formattedDate = new Date(
                currentDayObj.getTime() - currentDayObj.getTimezoneOffset() * 60000
            ).toISOString().split("T")[0];

            // Group shifts by station
            const stationOrder = ["SC/AGGRE", "ASSEMBLER", "CTR", "DINING", "FRY", "PANTRY", "B-UP", "GRILL", "STOCKMAN", "DOORMAN", "PC"];
            const shiftsByStation = {};
            
            scheduleData[day].forEach((shift) => {
                if (!shiftsByStation[shift.station]) {
                    shiftsByStation[shift.station] = [];
                }
                shiftsByStation[shift.station].push(shift);
            });
            
            // Sort shifts within each station: OPENING first, then CLOSING
            Object.keys(shiftsByStation).forEach(station => {
                shiftsByStation[station].sort((a, b) => {
                    const typeA = (a.type || "").toUpperCase();
                    const typeB = (b.type || "").toUpperCase();
                    
                    if (typeA === "OPENING" && typeB === "CLOSING") return -1;
                    if (typeA === "CLOSING" && typeB === "OPENING") return 1;
                    
                    return a.startTime.localeCompare(b.startTime);
                });
            });

            container.innerHTML += `
                <div class="day-container" style="margin-bottom:30px; background: white; padding: 25px; box-shadow: 0 4px 12px rgba(220, 0, 0, 0.1); border-radius: 15px; border-left: 5px solid #DC0000;">
                    
                    <!-- Landscape Suggestion Banner (Mobile Portrait Only) -->
                    <div class="landscape-suggestion-banner" style="display: none; background: linear-gradient(135deg, #FFC700 0%, #FFB000 100%); color: #333; padding: 12px 15px; border-radius: 10px; margin-bottom: 15px; text-align: center; font-weight: 600; box-shadow: 0 2px 8px rgba(255, 199, 0, 0.3); animation: pulse 2s infinite;">
                        <span style="font-size: 20px; margin-right: 8px;">📱</span>
                        <span style="font-size: 14px;">Rotate your phone to landscape for better viewing</span>
                        <span style="font-size: 20px; margin-left: 8px;">🔄</span>
                    </div>
                    
                    <h2 style="text-align: center; text-transform: uppercase; color: #DC0000; border-bottom: 3px solid #FFC700; padding-bottom: 10px; margin-bottom: 5px; font-size: 24px;">${day}</h2>
                    <h3 style="text-align: center; margin: 10px 0 20px 0; color: #666; font-size: 16px;">DATE: ${formattedDate}</h3>
                    
                    <table style="width: 100%; border-collapse: collapse; margin: 0 auto; font-family: Arial, sans-serif;">
                        <thead>
                            <tr style="background: linear-gradient(135deg, #DC0000 0%, #B00000 100%); color: white;">
                                <th style="border: 1px solid #DC0000; padding: 12px; text-align: left; width: 15%; font-size: 14px; font-weight: bold;">STATION</th>
                                <th style="border: 1px solid #DC0000; padding: 12px; text-align: left; width: 25%; font-size: 14px; font-weight: bold;">NAME</th>
                                <th style="border: 1px solid #DC0000; padding: 12px; text-align: center; width: 20%; font-size: 14px; font-weight: bold;">TIME</th>
                                <th style="border: 1px solid #DC0000; padding: 12px; text-align: center; width: 10%; font-size: 14px; font-weight: bold;">TYPE</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${stationOrder.map(stationName => {
                                const shifts = shiftsByStation[stationName] || [];
                                if (shifts.length === 0) return '';
                                
                                return shifts.map((shift, idx) => {
                                    return `
                                        <tr style="border: 1px solid #e0e0e0; transition: all 0.3s ease;" onmouseover="this.style.background='rgba(255, 199, 0, 0.1)'" onmouseout="this.style.background='white'">
                                            ${idx === 0 ? `<td rowspan="${shifts.length}" style="border: 1px solid #e0e0e0; padding: 12px; font-weight: bold; vertical-align: top; background: #f8f9fa; font-size: 13px; color: #DC0000;">${stationName}</td>` : ''}
                                            <td style="border: 1px solid #e0e0e0; padding: 10px; font-size: 14px; font-weight: 600;">${shift.crewName || "Unassigned"}</td>
                                            <td style="border: 1px solid #e0e0e0; padding: 10px; text-align: center; font-size: 13px; white-space: nowrap;">${shift.startTime} - ${shift.endTime}</td>
                                            <td style="border: 1px solid #e0e0e0; padding: 10px; text-align: center; font-size: 12px;">
                                                <span style="padding: 4px 8px; border-radius: 5px; background: ${shift.type === 'OPENING' ? '#dcfce7' : shift.type === 'CLOSING' ? '#fee2e2' : '#fef3c7'}; color: ${shift.type === 'OPENING' ? '#166534' : shift.type === 'CLOSING' ? '#991b1b' : '#854d0e'}; font-weight: 600;">
                                                    ${shift.type || 'MID'}
                                                </span>
                                            </td>
                                        </tr>
                                    `;
                                }).join('');
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        });

    } catch (error) {
        console.error("Error loading schedule:", error);
        container.innerHTML = "<p style='color: red;'>Error loading schedule.</p>";
    }
}

// ===============================
// 4. UNAVAILABILITY REQUESTS
// ===============================
// UPDATED FUNCTION
window.requestOff = async function() {
    const dateInput = document.getElementById("offDate").value;
    const reasonInput = document.getElementById("offReason").value.trim();
    
    if (!dateInput) {
        alert("Please select a date.");
        return;
    }
    
    if (!reasonInput) {
        alert("Please provide a reason for your request.");
        return;
    }
    
    if (reasonInput.length < 10) {
        alert("Please provide a more detailed reason (at least 10 characters).");
        return;
    }

    try {
        // This will now work because addDoc is imported
        await addDoc(collection(db, "unavailabilityRequests"), {
            crewName: currentCrewName,
            date: dateInput,
            reason: reasonInput,
            status: "pending", 
            requestedAt: serverTimestamp() 
        });
        
        alert("Request sent successfully!");
        
        // Clear the form
        document.getElementById("offDate").value = "";
        document.getElementById("offReason").value = "";
        document.getElementById("reasonCharCount").textContent = "0";
        
        loadMyRequestHistory(); 
    } catch (e) {
        console.error("Error sending request:", e);
        alert("Failed to send request. Check your browser console.");
    }
};

async function loadMyRequestHistory() {
    const historyDiv = document.getElementById("requestHistory");
    if (!historyDiv) return;

    try {
        const q = query(
            collection(db, "unavailabilityRequests"), 
            where("crewName", "==", currentCrewName)
        );
        
        const snap = await getDocs(q);
        if (snap.empty) {
            historyDiv.innerHTML = "<p style='color: gray;'>No requests submitted yet.</p>";
            return;
        }

        // Get today's date at midnight for comparison
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Convert to array for sorting and filtering
        const requests = [];
        const deletePromises = [];
        
        snap.forEach(docSnap => {
            const req = docSnap.data();
            
            // Parse the request date (format: YYYY-MM-DD)
            const requestDate = new Date(req.date);
            requestDate.setHours(0, 0, 0, 0);
            
            // Delete approved requests that are in the past
            if (req.status === "approved" && requestDate < today) {
                console.log(`Deleting past approved request: ${req.date}`);
                deletePromises.push(deleteDoc(doc(db, "unavailabilityRequests", docSnap.id)));
                return; // Don't show this request
            }
            
            requests.push({
                id: docSnap.id,
                data: req,
                date: requestDate
            });
        });
        
        // Sort by date descending (most recent first)
        requests.sort((a, b) => b.date - a.date);

        let html = "<div style='display: grid; gap: 12px;'>";
        
        requests.forEach(({ data: req }) => {
            const statusColor = req.status === "approved" ? "#10b981" : (req.status === "rejected" ? "#ef4444" : "#f59e0b");
            const statusIcon = req.status === "approved" ? "✓" : (req.status === "rejected" ? "✗" : "⏳");
            const reason = req.reason || "No reason provided";
            
            html += `
                <div style="
                    padding: 15px; 
                    border: 2px solid ${statusColor}20; 
                    background: white; 
                    border-radius: 10px;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.08);
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <span style="font-weight: 600; color: #333;">
                            📅 ${req.date}
                        </span>
                        <span style="
                            color: ${statusColor}; 
                            font-weight: bold; 
                            text-transform: uppercase; 
                            font-size: 0.85rem;
                            padding: 4px 10px;
                            background: ${statusColor}15;
                            border-radius: 6px;
                        ">
                            ${statusIcon} ${req.status}
                        </span>
                    </div>
                    <div style="
                        background: #f8f9fa; 
                        padding: 10px; 
                        border-radius: 6px; 
                        border-left: 3px solid ${statusColor};
                    ">
                        <p style="margin: 0; font-size: 13px; color: #666; font-weight: 600; margin-bottom: 4px;">
                            Reason:
                        </p>
                        <p style="margin: 0; font-size: 14px; color: #333; line-height: 1.5;">
                            ${reason}
                        </p>
                    </div>
                </div>
            `;
        });
        html += "</div>";
        
        // Execute all deletions
        if (deletePromises.length > 0) {
            await Promise.all(deletePromises);
            console.log(`Deleted ${deletePromises.length} past approved request(s)`);
        }
        
        if (requests.length === 0) {
            historyDiv.innerHTML = "<p style='color: gray;'>No requests to display.</p>";
        } else {
            historyDiv.innerHTML = html;
        }
    } catch (e) {
        console.error("Error loading history:", e);
        historyDiv.innerHTML = "<p style='color:red;'>Could not load history. Please try refreshing the page.</p>";
    }
}


// ===============================
// 5. LOGOUT
// ===============================
window.logout = async function() {
    const confirmLogout = confirm("Are you sure you want to logout?");
    if (!confirmLogout) return;
    
    try {
        // Remove the popstate handler before logout
        window.onpopstate = null;
        
        await signOut(auth);
        
        // Replace history to prevent back button from returning to authenticated page
        window.location.replace("login.html");
    } catch (e) {
        console.error("Error logging out:", e);
        alert("Error logging out. Please try again.");
    }
};
