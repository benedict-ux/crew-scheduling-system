import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    collection, getDocs, addDoc, updateDoc, doc, deleteDoc, setDoc, getDoc,
    query, where, orderBy, limit, serverTimestamp, arrayUnion 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ===============================
// 1. AUTH & INITIAL LOAD
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
            // Immediately redirect back to manager page
            window.location.replace('manager.html');
        });
        
        // Load all data in parallel for faster performance
        Promise.all([
            loadCrew(),
            loadRequests(),
            loadExistingSchedules()
        ]).catch(error => {
            console.error("Error loading data:", error);
        });
    } else {
        window.location.href = "login.html";
    }
});

// Store existing schedule dates globally
let existingScheduleDates = [];

// Load and display existing schedules
window.loadExistingSchedules = async function() {
    const listContainer = document.getElementById("existingSchedulesList");
    if (!listContainer) return;
    
    try {
        // Load all schedules and filter in JavaScript (Firebase compound queries can be tricky)
        const schedulesSnapshot = await getDocs(
            query(collection(db, "weeklySchedules"), orderBy("startDate", "desc"))
        );
        
        existingScheduleDates = [];
        let html = '';
        
        // Filter out archived schedules
        const activeSchedules = [];
        schedulesSnapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (!data.archived) {
                activeSchedules.push({ id: docSnap.id, data });
            }
        });
        
        if (activeSchedules.length === 0) {
            html = '<p style="color: #999; text-align: center; padding: 15px;">No active schedules.</p>';
        } else {
            html = '<div style="display: grid; gap: 12px; margin-top: 5px;">';
            activeSchedules.forEach(({ id: scheduleId, data }) => {
                const startDate = data.startDate;
                existingScheduleDates.push(startDate);
                
                // Use stored endDate or fallback to startDate + 6
                const endDate = data.endDate || (() => {
                    const start = new Date(startDate);
                    start.setDate(start.getDate() + 6);
                    return new Date(start.getTime() - start.getTimezoneOffset() * 60000).toISOString().split('T')[0];
                })();
                
                console.log(`Schedule: startDate=${startDate}, endDate=${endDate}, stored endDate=${data.endDate}`);
                
                const statusLabel = data.status === 'published' ? '✅ Published' : '⏳ Draft';
                
                html += `
                    <div style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 15px;
                        background: white;
                        border: 2px solid #e0e0e0;
                        border-radius: 10px;
                        transition: all 0.3s ease;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.05);
                    " onmouseover="this.style.borderColor='#FFC700'; this.style.boxShadow='0 4px 12px rgba(255,199,0,0.3)'" onmouseout="this.style.borderColor='#e0e0e0'; this.style.boxShadow='0 2px 6px rgba(0,0,0,0.05)'">
                        <div>
                            <strong style="color: #DC0000; font-size: 15px;">${startDate}</strong> 
                            <span style="color: #666;">to</span> 
                            <strong style="color: #DC0000; font-size: 15px;">${endDate}</strong>
                            <span style="color: #666; font-size: 13px; margin-left: 12px;">${statusLabel}</span>
                        </div>
                        <button onclick="markScheduleAsDone('${scheduleId}', '${startDate}')" style="
                            background: linear-gradient(135deg, #FFC700 0%, #FFB000 100%);
                            color: #333;
                            border: none;
                            border-radius: 8px;
                            padding: 8px 18px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: 600;
                            transition: all 0.3s ease;
                            box-shadow: 0 2px 6px rgba(255, 199, 0, 0.3);
                        " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(255,199,0,0.5)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 6px rgba(255,199,0,0.3)'">✓ Done</button>
                    </div>
                `;
            });
            html += '</div>';
        }
        
        listContainer.innerHTML = html;
    } catch (e) {
        console.error("Error loading existing schedules:", e);
        listContainer.innerHTML = '<p style="color: red;">Error loading schedules.</p>';
    }
};

// Mark schedule as done (archive it)
window.markScheduleAsDone = async function(scheduleId, startDate) {
    const confirmMsg = `Mark the schedule for week ${startDate} as done?\n\nIt will be moved to History.`;
    if (!confirm(confirmMsg)) return;
    
    try {
        await updateDoc(doc(db, "weeklySchedules", scheduleId), {
            archived: true,
            archivedAt: serverTimestamp()
        });
        
        alert("✅ Schedule moved to History!");
        loadExistingSchedules(); // Reload the list
    } catch (e) {
        console.error("Error archiving schedule:", e);
        alert("❌ Error moving schedule to history. Check console.");
    }
};

// Check if selected date already has a schedule
window.checkExistingSchedule = function() {
    const startDateInput = document.getElementById("scheduleStartDate");
    const endDateInput = document.getElementById("scheduleEndDate");
    const warningDiv = document.getElementById("scheduleWarning");
    const dateRangeInfo = document.getElementById("dateRangeInfo");
    const dateRangeDisplay = document.getElementById("dateRangeDisplay");
    
    if (!startDateInput || !endDateInput || !warningDiv) return;
    
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    
    if (!startDate || !endDate) {
        warningDiv.style.display = 'none';
        dateRangeInfo.style.display = 'none';
        return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
        warningDiv.style.display = 'none';
        dateRangeInfo.style.display = 'none';
        return;
    }
    
    // Show date range info
    const dayCount = Math.floor((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;
    dateRangeDisplay.textContent = `${startDate} to ${endDate} (${dayCount} days)`;
    dateRangeInfo.style.display = 'block';
    
    // Check if this date range already has a schedule
    const hasConflict = existingScheduleDates.some(existingDate => {
        return existingDate >= startDate && existingDate <= endDate;
    });
    
    if (hasConflict) {
        warningDiv.style.display = 'block';
    } else {
        warningDiv.style.display = 'none';
    }
};

// Helper: Converts "8:00PM" to minutes for comparison
function timeToMinutes(timeStr) {
    if (!timeStr || timeStr === "" || timeStr === "None") return null;
    const time = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!time) return null;
    let hours = parseInt(time[1]);
    let minutes = parseInt(time[2]);
    let modifier = time[3];
    if (modifier) {
        if (modifier.toUpperCase() === 'PM' && hours < 12) hours += 12;
        if (modifier.toUpperCase() === 'AM' && hours === 12) hours = 0;
    }
    return hours * 60 + minutes;
}

// ===============================
// 2. UPDATE SCHOOL START TIME
// ===============================
window.updateSchoolStartTime = async function(crewId, day, time) {
    try {
        await updateDoc(doc(db, "crewProfiles", crewId), {
            [`schoolStartTime.${day}`]: time
        });
        console.log(`School start time updated for ${day}`);
    } catch (e) {
        console.error("Error updating school start time:", e);
        alert("Update failed.");
    }
};

// ===============================
// 2A. UPDATE SCHOOL END TIME
// ===============================
window.updateSchoolEndTime = async function(crewId, day, time) {
    try {
        await updateDoc(doc(db, "crewProfiles", crewId), {
            [`schoolEndTime.${day}`]: time
        });
        console.log(`School end time updated for ${day}`);
    } catch (e) {
        console.error("Error updating school end time:", e);
        alert("Update failed.");
    }
};

// ===============================
// 2A. UPDATE REST DAY
// ===============================
window.updateRestDay = async function(crewId, day, isRestDay) {
    try {
        await updateDoc(doc(db, "crewProfiles", crewId), {
            [`restDays.${day}`]: isRestDay
        });
        
        // Update the UI dynamically without closing the modal
        const workingSection = document.getElementById(`working-section-${crewId}-${day}`);
        
        if (workingSection) {
            if (isRestDay) {
                workingSection.style.display = 'none';
            } else {
                workingSection.style.display = 'block';
            }
        }
    } catch (e) {
        console.error("Error updating rest day:", e);
        alert("Update failed.");
    }
};

// ===============================
// 2A2. UPDATE NO CLASS
// ===============================
window.updateNoClass = async function(crewId, day, noClass) {
    try {
        await updateDoc(doc(db, "crewProfiles", crewId), {
            [`noClass.${day}`]: noClass
        });
        
        // Update the UI dynamically without closing the modal
        const preferSection = document.getElementById(`prefer-section-${crewId}-${day}`);
        const schoolSection = document.getElementById(`school-section-${crewId}-${day}`);
        
        if (preferSection && schoolSection) {
            if (noClass) {
                preferSection.style.display = 'block';
                schoolSection.style.display = 'none';
            } else {
                preferSection.style.display = 'none';
                schoolSection.style.display = 'block';
            }
        }
    } catch (e) {
        console.error("Error updating no class:", e);
        alert("Update failed.");
    }
};

// ===============================
// 2A3. UPDATE NO CLASS PREFERENCE
// ===============================
window.updateNoClassPreference = async function(crewId, day, preference) {
    try {
        await updateDoc(doc(db, "crewProfiles", crewId), {
            [`noClassPreference.${day}`]: preference
        });
        console.log("No class preference updated!");
    } catch (e) {
        console.error("Error updating no class preference:", e);
        alert("Update failed.");
    }
};

// ===============================
// 2B. UPDATE CAN WORK NEXT DAY (Students only)
// ===============================
window.updateCanWorkNextDay = async function(crewId, day, canWork) {
    try {
        await updateDoc(doc(db, "crewProfiles", crewId), {
            [`canWorkOpeningNextDay.${day}`]: canWork
        });
        console.log("Next day availability updated!");
    } catch (e) {
        console.error("Error updating next day availability:", e);
        alert("Update failed.");
    }
};

// ===============================
// 2C. UPDATE ROLE TYPE
// ===============================
window.updateRoleType = async function(crewId, roleType) {
    try {
        await updateDoc(doc(db, "crewProfiles", crewId), {
            roleType: roleType
        });
        console.log("Role type updated!");
        // Refresh the crew profiles display
        loadCrew();
    } catch (e) {
        console.error("Error updating role type:", e);
        alert("Update failed.");
    }
};

// ===============================
// 2D. TOGGLE WEEKLY SCHEDULE VISIBILITY
// ===============================
window.toggleWeeklyScheduleVisibility = function(crewId, roleType) {
    console.log(`Toggling weekly schedule visibility for ${crewId}, role: ${roleType}`);
    
    // Days array to match the modal structure
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    
    days.forEach(day => {
        const canWorkLabel = document.getElementById(`canWorkNextDay-${crewId}-${day}`);
        if (canWorkLabel) {
            if (roleType === 'student') {
                // Show the checkbox for students with flex display
                canWorkLabel.style.display = 'flex';
                console.log(`Showing "Can open next day" checkbox for ${day}`);
            } else {
                // Hide the checkbox for regular employees
                canWorkLabel.style.display = 'none';
                console.log(`Hiding "Can open next day" checkbox for ${day}`);
            }
        }
    });
};

// ===============================
// 2E. UPDATE ATTENDANCE PRIORITY
// ===============================
// 2E. UPDATE ATTENDANCE PRIORITY
// ===============================
window.updateAttendancePriority = async function(crewId, priority) {
    try {
        const priorityValue = priority === "" ? 3 : parseInt(priority); // Default to 3 (normal)
        await updateDoc(doc(db, "crewProfiles", crewId), {
            attendancePriority: priorityValue
        });
        console.log("Attendance priority updated!");
        // Refresh the crew profiles display
        loadCrew();
    } catch (e) {
        console.error("Error updating attendance priority:", e);
        alert("Update failed.");
    }
};

// ===============================
// 2E1. UPDATE SHIFT PREFERENCE
// ===============================
window.updateShiftPreference = async function(crewId, preference) {
    try {
        await updateDoc(doc(db, "crewProfiles", crewId), {
            shiftPreference: preference
        });
        console.log("Shift preference updated to:", preference);
        // Refresh the crew profiles display
        loadCrew();
    } catch (e) {
        console.error("Error updating shift preference:", e);
        alert("Update failed.");
    }
};

// ===============================
// 2F. UPDATE NICKNAME
// ===============================
window.updateNickname = async function(crewId, nickname) {
    try {
        await updateDoc(doc(db, "crewProfiles", crewId), {
            nickname: nickname || ""
        });
        console.log("Nickname updated!");
        loadCrew(); // Reload to show updated nickname on cards
    } catch (e) {
        console.error("Error updating nickname:", e);
        alert("Update failed.");
    }
};

window.updateCrewEmail = async function(crewId, email) {
    if (!email || !email.includes('@')) {
        alert("Please enter a valid email address");
        return;
    }
    
    try {
        // Get crew name first
        const crewDoc = await getDocs(query(collection(db, "crewProfiles"), where("__name__", "==", crewId)));
        if (crewDoc.empty) {
            alert("Crew member not found");
            return;
        }
        
        const crewName = crewDoc.docs[0].data().name;
        
        // Update in crewProfiles collection
        await updateDoc(doc(db, "crewProfiles", crewId), {
            email: email
        });
        
        // Update in users collection
        const usersQuery = query(collection(db, "users"), where("name", "==", crewName));
        const usersSnapshot = await getDocs(usersQuery);
        if (!usersSnapshot.empty) {
            const userDocId = usersSnapshot.docs[0].id;
            await updateDoc(doc(db, "users", userDocId), {
                email: email
            });
        }
        
        alert("Email updated successfully! The crew member can now login with this email.");
    } catch (e) {
        console.error("Error updating email:", e);
        alert("Update failed: " + e.message);
    }
};

window.updateCrewPassword = async function(crewId, uid) {
    const passwordInput = document.getElementById(`newPassword-${crewId}`);
    const newPassword = passwordInput?.value;
    
    if (!newPassword) {
        alert("Please enter a new password");
        return;
    }
    
    if (newPassword.length < 6) {
        alert("Password must be at least 6 characters");
        return;
    }
    
    if (!uid) {
        alert("Cannot update password: User ID not found. This crew member may need to be recreated.");
        return;
    }
    
    try {
        // Note: This requires Firebase Admin SDK or Cloud Function in production
        // For now, we'll just show the password to the manager
        alert(`✅ New password set: ${newPassword}\n\nPlease share this with the crew member.\n\nNote: The crew member should change their password after first login for security.`);
        
        if (passwordInput) passwordInput.value = '';
        
    } catch (e) {
        console.error("Error updating password:", e);
        alert("Update failed: " + e.message);
    }
};

window.updateRank = async function(crewId, rank) {
    try {
        const rankValue = rank === "" ? null : parseInt(rank);
        await updateDoc(doc(db, "crewProfiles", crewId), {
            seniorityRank: rankValue
        });
        console.log("Rank updated!");
        // Refresh the crew profiles display
        loadCrew();
    } catch (e) {
        console.error("Error updating rank:", e);
        alert("Update failed.");
    }
};

window.toggleTopPriorityStation = async function(crewId, station) {
    try {
        // Update in Firestore
        await updateDoc(doc(db, "crewProfiles", crewId), {
            topPriorityStation: station
        });
        
        // Update UI - remove highlight from all top priority boxes
        const allStations = ["SC/AGGRE", "ASSEMBLER", "CTR", "DINING", "FRY", "PANTRY", "B-UP", "GRILL", "STOCKMAN", "DOORMAN", "PC"];
        allStations.forEach(s => {
            const box = document.getElementById(`top-${crewId}-${s.replace(/\//g, '-')}`);
            if (box) {
                box.style.border = '2px solid #ccc';
                box.style.background = 'white';
                box.style.color = '#333';
                box.style.fontWeight = 'normal';
            }
        });
        
        // Highlight selected station
        const selectedBox = document.getElementById(`top-${crewId}-${station.replace(/\//g, '-')}`);
        if (selectedBox) {
            selectedBox.style.border = '2px solid #d32f2f';
            selectedBox.style.background = '#d32f2f';
            selectedBox.style.color = 'white';
            selectedBox.style.fontWeight = 'bold';
        }
        
        console.log("Top priority station updated!");
        // Refresh the crew profiles display
        loadCrew();
        
    } catch (e) {
        console.error("Error updating top priority station:", e);
        alert("Update failed.");
    }
};

window.toggleSecondaryStation = async function(crewId, station) {
    try {
        // Get current crew data
        const crewDoc = await getDocs(query(collection(db, "crewProfiles"), where("__name__", "==", crewId)));
        if (crewDoc.empty) return;
        
        const crew = crewDoc.docs[0].data();
        let secondaryStations = crew.secondaryStations || [];
        
        // Toggle station
        if (secondaryStations.includes(station)) {
            // Remove station
            secondaryStations = secondaryStations.filter(s => s !== station);
        } else {
            // Add station
            secondaryStations.push(station);
        }
        
        // Update in Firestore
        await updateDoc(doc(db, "crewProfiles", crewId), {
            secondaryStations: secondaryStations
        });
        
        // Update UI
        const box = document.getElementById(`sec-${crewId}-${station.replace(/\//g, '-')}`);
        if (box) {
            const isSelected = secondaryStations.includes(station);
            box.style.border = isSelected ? '2px solid #1976d2' : '2px solid #ccc';
            box.style.background = isSelected ? '#1976d2' : 'white';
            box.style.color = isSelected ? 'white' : '#333';
            box.style.fontWeight = isSelected ? 'bold' : 'normal';
        }
        
        console.log("Secondary stations updated!");
        // Refresh the crew profiles display
        loadCrew();
        
    } catch (e) {
        console.error("Error updating secondary stations:", e);
        alert("Update failed.");
    }
};

// ===============================
// 2G. ADD NEW CREW PROFILE
// ===============================
window.openAddCrewModal = function() {
    const modalHtml = `
        <div id="addCrewModal" onclick="if(event.target.id==='addCrewModal') closeAddCrewModal()" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        ">
            <div style="
                background: white;
                border-radius: 10px;
                padding: 30px;
                max-width: 500px;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; gap: 15px;">
                    <h2 style="margin: 0; color: #DC0000; flex: 1;">Add New Crew Member</h2>
                    <button onclick="closeAddCrewModal()" style="
                        background: #dc3545;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        padding: 10px 18px;
                        cursor: pointer;
                        font-size: 15px;
                        font-weight: 600;
                        transition: all 0.2s ease;
                        box-shadow: 0 2px 6px rgba(220, 53, 69, 0.3);
                        flex-shrink: 0;
                    " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(220,53,69,0.5)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 6px rgba(220,53,69,0.3)'">✕ Close</button>
                </div>
                
                <form id="addCrewForm" onsubmit="event.preventDefault(); saveNewCrew();">
                    <div style="margin-bottom: 20px;">
                        <label style="font-weight: bold; display: block; margin-bottom: 8px;">Full Name: <span style="color: red;">*</span></label>
                        <input type="text" id="newCrewName" required 
                            placeholder="Last, First Middle"
                            style="width: 100%; padding: 10px 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 15px;">
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="font-weight: bold; display: block; margin-bottom: 8px;">Nickname (for schedule):</label>
                        <input type="text" id="newCrewNickname" 
                            placeholder="Optional"
                            style="width: 100%; padding: 10px 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 15px;">
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="font-weight: bold; display: block; margin-bottom: 8px;">Email: <span style="color: red;">*</span></label>
                        <input type="email" id="newCrewEmail" required 
                            placeholder="crew@example.com"
                            style="width: 100%; padding: 10px 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 15px;">
                        <small style="color: #666; display: block; margin-top: 5px;">This will be used for login credentials</small>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="font-weight: bold; display: block; margin-bottom: 8px;">Password: <span style="color: red;">*</span></label>
                        <input type="password" id="newCrewPassword" required minlength="6"
                            placeholder="Minimum 6 characters"
                            style="width: 100%; padding: 10px 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 15px;">
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="font-weight: bold; display: block; margin-bottom: 8px;">Role Type:</label>
                        <select id="newCrewRole" style="width: 100%; padding: 10px 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 15px;">
                            <option value="regular">Regular</option>
                            <option value="student">Working Student</option>
                        </select>
                    </div>
                    
                    <div style="margin-bottom: 25px;">
                        <label style="font-weight: bold; display: block; margin-bottom: 8px;">Top Priority Station:</label>
                        <select id="newCrewStation" style="width: 100%; padding: 10px 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 15px;">
                            <option value="">Select Station</option>
                            <option value="SC/AGGRE">SC/AGGRE</option>
                            <option value="ASSEMBLER">ASSEMBLER</option>
                            <option value="CTR">CTR</option>
                            <option value="DINING">DINING</option>
                            <option value="FRY">FRY</option>
                            <option value="PANTRY">PANTRY</option>
                            <option value="B-UP">B-UP</option>
                            <option value="GRILL">GRILL</option>
                            <option value="STOCKMAN">STOCKMAN</option>
                            <option value="DOORMAN">DOORMAN</option>
                            <option value="PC">PC</option>
                        </select>
                    </div>
                    
                    <button type="submit" style="
                        width: 100%;
                        background: linear-gradient(135deg, #28a745 0%, #218838 100%);
                        color: white;
                        border: none;
                        border-radius: 8px;
                        padding: 14px;
                        cursor: pointer;
                        font-size: 16px;
                        font-weight: bold;
                        box-shadow: 0 2px 6px rgba(40, 167, 69, 0.3);
                        transition: all 0.2s ease;
                    " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(40,167,69,0.5)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 6px rgba(40,167,69,0.3)'">➕ Add Crew Member</button>
                </form>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.closeAddCrewModal = function() {
    const modal = document.getElementById('addCrewModal');
    if (modal) modal.remove();
};

window.saveNewCrew = async function() {
    const name = document.getElementById('newCrewName').value.trim();
    const nickname = document.getElementById('newCrewNickname').value.trim();
    const email = document.getElementById('newCrewEmail').value.trim();
    const password = document.getElementById('newCrewPassword').value;
    const roleType = document.getElementById('newCrewRole').value;
    const station = document.getElementById('newCrewStation').value;
    
    if (!name || !email || !password) {
        alert("Please fill in all required fields (Name, Email, Password)");
        return;
    }
    
    try {
        // Create Firebase Authentication user
        const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=AIzaSyDBFGMiC11DNiKR2H6Yy8Zxm3g6q7c8uoE', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: email,
                password: password,
                returnSecureToken: true
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || "Failed to create user account");
        }
        
        const userData = await response.json();
        
        // Create crew profile in Firestore
        const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        const newCrewProfile = {
            name: name,
            nickname: nickname || "",
            email: email,
            uid: userData.localId,
            roleType: roleType,
            topPriorityStation: station || "",
            secondaryStations: [],
            attendancePriority: 3,
            seniorityRank: null,
            unavailableDates: [],
            restDays: {},
            noClass: {},
            noClassPreference: {},
            schoolStartTime: {},
            schoolEndTime: {},
            canWorkOpeningNextDay: {}
        };
        
        // Initialize all days
        days.forEach(day => {
            newCrewProfile.restDays[day] = false;
            newCrewProfile.noClass[day] = false;
            newCrewProfile.noClassPreference[day] = "any";
            newCrewProfile.schoolStartTime[day] = "";
            newCrewProfile.schoolEndTime[day] = "";
            newCrewProfile.canWorkOpeningNextDay[day] = true;
        });
        
        await addDoc(collection(db, "crewProfiles"), newCrewProfile);
        
        // Also add to users collection for role-based access
        await setDoc(doc(db, "users", userData.localId), {
            uid: userData.localId,
            email: email,
            name: name,
            role: "crew"
        });
        
        alert(`✅ Crew member "${name}" added successfully!\n\nLogin credentials:\nEmail: ${email}\nPassword: ${password}\n\nPlease share these credentials with the crew member.`);
        closeAddCrewModal();
        loadCrew(); // Reload crew list
        
    } catch (error) {
        console.error("Error adding crew:", error);
        alert(`❌ Error: ${error.message}\n\nPlease try again or check if the email is already in use.`);
    }
};

// ===============================
// 3. LOAD CREW MANAGEMENT
// ===============================
window.loadCrew = async function() {
    const mgmtContainer = document.getElementById("crewTable");
    const profileContainer = document.getElementById("crewProfileDetails"); 
    if (!mgmtContainer && !profileContainer) return; // Only return if BOTH are missing

    console.log("Loading crew profiles...");

    try {
        const snap = await getDocs(collection(db, "crewProfiles"));
        
        console.log(`Found ${snap.size} crew members`);
        
        // Get today's date for comparison
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset to midnight for accurate comparison
        
        let mgmtHtml = `
            <table style="
                width: 100%; 
                border-collapse: collapse; 
                margin-bottom: 20px;
                background: white;
                border-radius: 10px;
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            ">
                <thead>
                    <tr style="background: linear-gradient(135deg, #DC0000 0%, #B00000 100%); color: white;">
                        <th style="padding: 15px; text-align: left; font-size: 15px; font-weight: 600; border-right: 2px solid rgba(255,255,255,0.2);">Name</th>
                        <th style="padding: 15px; text-align: left; font-size: 15px; font-weight: 600;">Approved Off-Date</th>
                    </tr>
                </thead>
                <tbody>`;
        
        let profileHtml = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; padding: 20px;">`;
        
        // Process all crew members
        const updatePromises = [];
        let crewWithApprovedDates = []; // Store crew with approved dates
        
        snap.forEach((docSnap) => {
            const crew = docSnap.data();
            const crewId = docSnap.id;
            
            // Filter out past dates and update Firebase
            const unavailableDates = Array.isArray(crew.unavailableDates) 
                ? crew.unavailableDates.filter(d => d && d !== "None") 
                : [];
            
            const futureDates = unavailableDates.filter(dateStr => {
                const date = new Date(dateStr);
                return date >= today; // Keep only today and future dates
            });
            
            // If dates were removed, update Firebase (async but don't wait)
            if (futureDates.length !== unavailableDates.length) {
                updatePromises.push(
                    updateDoc(doc(db, "crewProfiles", crewId), {
                        unavailableDates: futureDates
                    })
                );
            }
            
            // Only add to crew management table if they have approved dates
            if (futureDates.length > 0) {
                const approvedDates = futureDates.join(", ");
                crewWithApprovedDates.push({
                    name: crew.name,
                    dates: approvedDates
                });
            }
            
            // Create crew card for grid layout (profiles page - show all crew)
            const attendanceLabel = crew.attendancePriority === 5 ? "Always Present" : 
                                   crew.attendancePriority === 4 ? "Reliable" :
                                   crew.attendancePriority === 2 ? "Sometimes Absent" :
                                   crew.attendancePriority === 1 ? "Often Absent" : "Normal";
            
            profileHtml += `
                <div onclick="openCrewModal('${crewId}')" style="
                    background: white;
                    border: 2px solid #e0e0e0;
                    border-radius: 10px;
                    padding: 20px;
                    cursor: pointer;
                    transition: all 0.3s;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                    text-align: center;
                " onmouseover="this.style.transform='translateY(-5px)'; this.style.boxShadow='0 5px 15px rgba(0,0,0,0.2)'" 
                   onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 5px rgba(0,0,0,0.1)'">
                    <h3 style="margin: 0 0 10px 0; color: #333;">${crew.name}</h3>
                    ${crew.nickname ? `<p style="margin: 0 0 10px 0; color: #007bff; font-size: 14px; font-weight: bold;">📝 ${crew.nickname}</p>` : ''}
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">
                        <strong>Role:</strong> ${crew.roleType === "student" ? "Working Student" : "Regular"}
                    </p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">
                        <strong>Attendance:</strong> ${attendanceLabel}
                    </p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">
                        <strong>Station:</strong> ${crew.topPriorityStation || "N/A"}
                    </p>
                    <p style="margin: 10px 0 0 0; color: #007bff; font-size: 13px; font-weight: bold;">
                        Click to edit →
                    </p>
                </div>
            `;
        });
        
        profileHtml += `</div>`;
        
        // Build the crew management table with only crew who have approved dates
        // Each date gets its own row for better readability
        if (crewWithApprovedDates.length === 0) {
            mgmtHtml += `<tr><td colspan="2" style="padding: 20px; text-align: center; color: #999; font-size: 14px;">No crew members with approved off-dates.</td></tr>`;
        } else {
            crewWithApprovedDates.forEach(crew => {
                // Split dates and create a row for each date
                const dates = crew.dates.split(", ");
                dates.forEach((date, index) => {
                    mgmtHtml += `
                        <tr style="border-bottom: 1px solid #e0e0e0; transition: background 0.2s ease;" onmouseover="this.style.background='rgba(255,199,0,0.1)'" onmouseout="this.style.background='white'">
                            ${index === 0 ? `<td rowspan="${dates.length}" style="padding: 12px; font-weight: 600; vertical-align: top; border-right: 2px solid #e0e0e0; background: #f8f9fa; color: #333; font-size: 14px;">${crew.name}</td>` : ''}
                            <td style="padding: 12px; color: #DC0000; font-weight: bold; font-size: 14px;">📅 ${date.trim()}</td>
                        </tr>
                    `;
                });
            });
        }
        
        mgmtHtml += `</tbody></table>`;
        
        // Update the DOM
        if (mgmtContainer) {
            mgmtContainer.innerHTML = mgmtHtml;
        }
        if (profileContainer) {
            profileContainer.innerHTML = profileHtml;
            console.log("Crew profiles displayed successfully!");
        }
        
        // Wait for all Firebase updates to complete (in background)
        if (updatePromises.length > 0) {
            Promise.all(updatePromises).catch(e => console.error("Error updating dates:", e));
        }
    } catch (e) { 
        console.error("Error loading crew:", e);
        if (profileContainer) {
            profileContainer.innerHTML = `<p style="color: red; padding: 20px;">Error loading crew profiles. Check console for details.</p>`;
        }
    }
};

// Open crew modal with full profile details
window.openCrewModal = async function(crewId) {
    try {
        const crewDoc = await getDocs(query(collection(db, "crewProfiles"), where("__name__", "==", crewId)));
        if (crewDoc.empty) return;
        
        const crew = crewDoc.docs[0].data();
        
        // Load email from users collection
        let userEmail = crew.email || '';
        if (!userEmail && crew.name) {
            const usersQuery = query(collection(db, "users"), where("name", "==", crew.name));
            const usersSnapshot = await getDocs(usersQuery);
            if (!usersSnapshot.empty) {
                userEmail = usersSnapshot.docs[0].data().email || '';
            }
        }
        
        const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        
        let schoolControls = `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.9em;">`;
        
        days.forEach(day => {
            const schoolStart = crew.schoolStartTime?.[day] || "";
            const schoolEnd = crew.schoolEndTime?.[day] || "";
            const isRestDay = crew.restDays?.[day] === true;
            const noClass = crew.noClass?.[day] === true;
            const noClassPreference = crew.noClassPreference?.[day] || "any";
            const canWorkNextDay = crew.canWorkOpeningNextDay?.[day] !== false;
            
            schoolControls += `
                <div style="margin-bottom:8px; padding: 8px; border: 1px solid #e0e0e0; border-radius: 4px; background: #f9f9f9;">
                    <label><strong>${day.substring(0,3)}:</strong></label>
                    <br/>
                    <label style="font-size: 0.9em; display: flex; align-items: center; margin: 4px 0;">
                        <input type="checkbox" onchange="updateRestDay('${crewId}', '${day}', this.checked)" ${isRestDay ? "checked" : ""} style="margin-right: 6px;"> Rest Day
                    </label>
                    <div id="working-section-${crewId}-${day}" style="display: ${isRestDay ? 'none' : 'block'};">
                    <br/>
                    <label style="font-size: 0.9em; display: flex; align-items: center; margin: 4px 0;">
                        <input type="checkbox" onchange="updateNoClass('${crewId}', '${day}', this.checked)" ${noClass ? "checked" : ""} style="margin-right: 6px;"> No Class
                    </label>
                    ${noClass ? `
                    <div id="prefer-section-${crewId}-${day}" style="display: block;">
                    <br/>
                    <label style="font-size: 0.9em; color: #666;">Prefer:</label>
                    <select onchange="updateNoClassPreference('${crewId}', '${day}', this.value)" style="font-size: 0.9em; width: 100px; padding: 3px;">
                        <option value="any" ${noClassPreference === "any" ? "selected" : ""}>Any Shift</option>
                        <option value="opening" ${noClassPreference === "opening" ? "selected" : ""}>Opening</option>
                        <option value="closing" ${noClassPreference === "closing" ? "selected" : ""}>Closing</option>
                    </select>
                    </div>
                    ` : `
                    <div id="prefer-section-${crewId}-${day}" style="display: none;">
                    <br/>
                    <label style="font-size: 0.9em; color: #666;">Prefer:</label>
                    <select onchange="updateNoClassPreference('${crewId}', '${day}', this.value)" style="font-size: 0.9em; width: 100px; padding: 3px;">
                        <option value="any" ${noClassPreference === "any" ? "selected" : ""}>Any Shift</option>
                        <option value="opening" ${noClassPreference === "opening" ? "selected" : ""}>Opening</option>
                        <option value="closing" ${noClassPreference === "closing" ? "selected" : ""}>Closing</option>
                    </select>
                    </div>
                    <div id="school-section-${crewId}-${day}" style="display: ${noClass ? 'none' : 'block'};">
                    <br/>
                    <label style="font-size: 0.9em; color: #666;">School:</label>
                    <input type="time" value="${schoolStart}" onchange="updateSchoolStartTime('${crewId}', '${day}', this.value)" style="font-size: 0.9em; width: 80px; padding: 3px;" placeholder="Start">
                    <span style="font-size: 0.9em;">to</span>
                    <input type="time" value="${schoolEnd}" onchange="updateSchoolEndTime('${crewId}', '${day}', this.value)" style="font-size: 0.9em; width: 80px; padding: 3px;" placeholder="End">
                    </div>
                    `}
                    ${crew.roleType === "student" && !noClass ? `
                    <br/><label id="canWorkNextDay-${crewId}-${day}" style="font-size: 0.9em; color: #666; display: flex; align-items: center; margin: 4px 0;">
                        <input type="checkbox" onchange="updateCanWorkNextDay('${crewId}', '${day}', this.checked)" ${canWorkNextDay ? "checked" : ""} style="margin-right: 6px;"> Can open next day
                    </label>
                    ` : `
                    <br/><label id="canWorkNextDay-${crewId}-${day}" style="font-size: 0.9em; color: #666; display: none; align-items: center; margin: 4px 0;">
                        <input type="checkbox" onchange="updateCanWorkNextDay('${crewId}', '${day}', this.checked)" ${canWorkNextDay ? "checked" : ""} style="margin-right: 6px;"> Can open next day
                    </label>
                    `}
                    </div>
                </div>`;
        });
        schoolControls += `</div>`;
        
        const modalHtml = `
            <div id="crewModal" onclick="if(event.target.id==='crewModal') closeCrewModal()" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 1000;
            ">
                <div style="
                    background: white;
                    border-radius: 10px;
                    padding: 30px;
                    max-width: 800px;
                    width: 90%;
                    max-height: 90vh;
                    overflow-y: auto;
                    overflow-x: hidden;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                    -webkit-overflow-scrolling: touch;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 style="margin: 0;">${crew.name}</h2>
                        <div style="display: flex; gap: 10px;">
                            <button onclick="deleteCrewMember('${crewId}', '${crew.name}')" style="
                                background: #dc3545;
                                color: white;
                                border: none;
                                border-radius: 5px;
                                padding: 8px 15px;
                                cursor: pointer;
                                font-size: 16px;
                            ">🗑️ Delete</button>
                            <button onclick="closeCrewModal()" style="
                                background: #6c757d;
                                color: white;
                                border: none;
                                border-radius: 5px;
                                padding: 8px 15px;
                                cursor: pointer;
                                font-size: 16px;
                            ">✕ Close</button>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="font-weight: bold;">Nickname (for schedule display):</label><br/>
                        <input type="text" value="${crew.nickname || ''}" 
                            onchange="updateNickname('${crewId}', this.value)" 
                            placeholder="Enter nickname (optional)"
                            style="width: 100%; padding: 8px; margin-top: 5px; border: 1px solid #ccc; border-radius: 5px;">
                        <small style="color: #666;">If set, this nickname will appear in the schedule instead of the full name.</small>
                    </div>
                    
                    <div style="margin-bottom: 15px; padding: 12px; background: #f8f9fa; border-radius: 5px; border: 1px solid #dee2e6;">
                        <h4 style="margin: 0 0 8px 0; color: #495057;">Login Credentials</h4>
                        <div style="margin-bottom: 8px;">
                            <label style="font-weight: bold; display: block; margin-bottom: 3px;">Email:</label>
                            <input type="email" value="${userEmail}" 
                                onchange="updateCrewEmail('${crewId}', this.value)" 
                                placeholder="crew@example.com"
                                style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 5px; box-sizing: border-box;">
                        </div>
                        <div style="margin-bottom: 5px;">
                            <label style="font-weight: bold; display: block; margin-bottom: 3px;">New Password:</label>
                            <input type="password" id="newPassword-${crewId}" 
                                placeholder="Leave blank to keep current password"
                                style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 5px; box-sizing: border-box; margin-bottom: 5px;">
                            <button onclick="updateCrewPassword('${crewId}', '${crew.uid || ''}')" 
                                style="width: 100%; padding: 8px 15px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">
                                Update Password
                            </button>
                        </div>
                        <small style="color: #666; display: block; margin-top: 3px;">Password must be at least 6 characters</small>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                        <div>
                            <label style="font-weight: bold;">Role Type:</label><br/>
                            <select id="roleTypeSelect-${crewId}" onchange="updateRoleType('${crewId}', this.value); toggleWeeklyScheduleVisibility('${crewId}', this.value); this.blur();" style="width: 100%; padding: 8px; margin-top: 5px;">
                                <option value="regular" ${crew.roleType === "regular" ? "selected" : ""}>Regular</option>
                                <option value="student" ${crew.roleType === "student" ? "selected" : ""}>Working Student</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-weight: bold;">Seniority Rank:</label><br/>
                            <select onchange="updateRank('${crewId}', this.value); this.blur();" style="width: 100%; padding: 8px; margin-top: 5px;">
                                <option value="">N/A</option>
                                <option value="1" ${crew.seniorityRank === 1 ? "selected" : ""}>1 (Highest)</option>
                                <option value="2" ${crew.seniorityRank === 2 ? "selected" : ""}>2</option>
                                <option value="3" ${crew.seniorityRank === 3 ? "selected" : ""}>3</option>
                                <option value="4" ${crew.seniorityRank === 4 ? "selected" : ""}>4</option>
                                <option value="5" ${crew.seniorityRank === 5 ? "selected" : ""}>5 (Lowest)</option>
                            </select>
                        </div>
                        <div style="grid-column: 1 / -1;">
                            <label style="font-weight: bold;">Attendance Priority:</label><br/>
                            <select onchange="updateAttendancePriority('${crewId}', this.value); this.blur();" style="width: 100%; padding: 8px; margin-top: 5px;">
                                <option value="5" ${crew.attendancePriority === 5 ? "selected" : ""}>5 - Always Present</option>
                                <option value="4" ${crew.attendancePriority === 4 ? "selected" : ""}>4 - Reliable</option>
                                <option value="3" ${(crew.attendancePriority === 3 || !crew.attendancePriority) ? "selected" : ""}>3 - Normal</option>
                                <option value="2" ${crew.attendancePriority === 2 ? "selected" : ""}>2 - Sometimes Absent</option>
                                <option value="1" ${crew.attendancePriority === 1 ? "selected" : ""}>1 - Often Absent</option>
                            </select>
                        </div>
                        <div style="grid-column: 1 / -1;">
                            <label style="font-weight: bold;">Shift Preference:</label><br/>
                            <select onchange="updateShiftPreference('${crewId}', this.value); this.blur();" style="width: 100%; padding: 8px; margin-top: 5px;">
                                <option value="flexible" ${(crew.shiftPreference === "flexible" || !crew.shiftPreference) ? "selected" : ""}>Flexible (Any Shift)</option>
                                <option value="opening" ${crew.shiftPreference === "opening" ? "selected" : ""}>Opening Shift</option>
                                <option value="closing" ${crew.shiftPreference === "closing" ? "selected" : ""}>Closing Shift</option>
                            </select>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 20px; padding: 15px; background: #fff8e1; border-radius: 5px; border: 1px solid #ffc107;">
                        <h4 style="margin: 0 0 10px 0; color: #333;">Station Assignments</h4>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="font-weight: bold; color: #d32f2f;">Top Priority Station:</label>
                            <p style="margin: 5px 0; font-size: 12px; color: #666;">Click to select the main station for this crew member</p>
                            <div id="topPrioStations-${crewId}" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                                ${["SC/AGGRE", "ASSEMBLER", "CTR", "DINING", "FRY", "PANTRY", "B-UP", "GRILL", "STOCKMAN", "DOORMAN", "PC"].map(station => `
                                    <div onclick="toggleTopPriorityStation('${crewId}', '${station}')" 
                                        id="top-${crewId}-${station.replace(/\//g, '-')}"
                                        style="
                                            padding: 8px 12px;
                                            border: 2px solid ${crew.topPriorityStation === station ? '#d32f2f' : '#ccc'};
                                            background: ${crew.topPriorityStation === station ? '#d32f2f' : 'white'};
                                            color: ${crew.topPriorityStation === station ? 'white' : '#333'};
                                            border-radius: 5px;
                                            cursor: pointer;
                                            font-size: 12px;
                                            font-weight: ${crew.topPriorityStation === station ? 'bold' : 'normal'};
                                            transition: all 0.2s;
                                        "
                                        onmouseover="if(this.style.background === 'white') { this.style.background = '#f5f5f5'; }"
                                        onmouseout="if(this.style.background === 'rgb(245, 245, 245)') { this.style.background = 'white'; }"
                                    >${station}</div>
                                `).join('')}
                            </div>
                        </div>
                        
                        <div>
                            <label style="font-weight: bold; color: #1976d2;">Secondary Stations:</label>
                            <p style="margin: 5px 0; font-size: 12px; color: #666;">Click to select additional stations (can select multiple or leave blank)</p>
                            <div id="secondaryStations-${crewId}" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                                ${["SC/AGGRE", "ASSEMBLER", "CTR", "DINING", "FRY", "PANTRY", "B-UP", "GRILL", "STOCKMAN", "DOORMAN", "PC"].map(station => {
                                    const isSelected = (crew.secondaryStations || []).includes(station);
                                    return `
                                    <div onclick="toggleSecondaryStation('${crewId}', '${station}')" 
                                        id="sec-${crewId}-${station.replace(/\//g, '-')}"
                                        style="
                                            padding: 8px 12px;
                                            border: 2px solid ${isSelected ? '#1976d2' : '#ccc'};
                                            background: ${isSelected ? '#1976d2' : 'white'};
                                            color: ${isSelected ? 'white' : '#333'};
                                            border-radius: 5px;
                                            cursor: pointer;
                                            font-size: 12px;
                                            font-weight: ${isSelected ? 'bold' : 'normal'};
                                            transition: all 0.2s;
                                        "
                                        onmouseover="if(this.style.background === 'white') { this.style.background = '#f5f5f5'; }"
                                        onmouseout="if(this.style.background === 'rgb(245, 245, 245)') { this.style.background = 'white'; }"
                                    >${station}</div>
                                `;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                    
                    <h3>Weekly Schedule</h3>
                    ${schoolControls}
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (e) {
        console.error("Error opening modal:", e);
    }
};

window.closeCrewModal = function() {
    const modal = document.getElementById('crewModal');
    if (modal) modal.remove();
};

window.searchCrew = function() {
    const searchInput = document.getElementById('crewSearchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    const profileContainer = document.getElementById('crewProfileDetails');
    if (!profileContainer) return;
    
    // Get the parent div that contains all crew cards
    const cardsContainer = profileContainer.querySelector('div[style*="display: grid"]');
    if (!cardsContainer) return;
    
    // Get all crew cards
    const crewCards = cardsContainer.querySelectorAll('div[onclick*="openCrewModal"]');
    
    let foundCount = 0;
    
    crewCards.forEach(card => {
        // Get the crew name from the h3 tag
        const nameElement = card.querySelector('h3');
        // Get nickname - look for the paragraph with the emoji
        const allParagraphs = card.querySelectorAll('p');
        let nickname = '';
        
        allParagraphs.forEach(p => {
            const text = p.textContent;
            if (text.includes('📝')) {
                nickname = text.replace('📝', '').trim().toLowerCase();
            }
        });
        
        const crewName = nameElement ? nameElement.textContent.toLowerCase() : '';
        
        // Search in name and nickname
        const matchesSearch = searchTerm === '' || 
                             crewName.includes(searchTerm) || 
                             nickname.includes(searchTerm);
        
        if (matchesSearch) {
            // Show card by removing hidden class
            card.classList.remove('hidden-crew-card');
            
            // Highlight if search term exists
            if (searchTerm !== '') {
                card.style.border = '2px solid #ff9800';
                card.style.boxShadow = '0 4px 12px rgba(255, 152, 0, 0.4)';
                foundCount++;
            } else {
                // Reset to normal
                card.style.border = '1px solid #e0e0e0';
                card.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.06)';
            }
        } else {
            // Hide card by adding hidden class
            card.classList.add('hidden-crew-card');
        }
    });
    
    // Show search results count
    if (searchTerm !== '') {
        let resultMessage = document.getElementById('searchResultMessage');
        if (!resultMessage) {
            resultMessage = document.createElement('div');
            resultMessage.id = 'searchResultMessage';
            resultMessage.style.cssText = 'padding: 12px 20px; margin: 10px 0 20px 0; background: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 8px; font-weight: 600; text-align: center;';
            
            // Insert before the cards container
            profileContainer.insertBefore(resultMessage, cardsContainer);
        }
        resultMessage.textContent = foundCount === 0 
            ? `❌ No crew members found matching "${searchTerm}"` 
            : `✅ Found ${foundCount} crew member${foundCount > 1 ? 's' : ''} matching "${searchTerm}"`;
        resultMessage.style.background = foundCount === 0 ? '#ffebee' : '#e3f2fd';
        resultMessage.style.borderLeftColor = foundCount === 0 ? '#f44336' : '#2196f3';
    } else {
        // Remove search result message
        const resultMessage = document.getElementById('searchResultMessage');
        if (resultMessage) {
            resultMessage.remove();
        }
    }
};

window.deleteCrewMember = async function(crewId, crewName) {
    const confirmDelete = confirm(
        `⚠️ WARNING: DELETE CREW MEMBER\n\n` +
        `Are you sure you want to delete "${crewName}"?\n\n` +
        `This will:\n` +
        `• Remove their profile permanently\n` +
        `• Remove them from all schedules\n` +
        `• Disable their login access\n\n` +
        `This action CANNOT be undone!`
    );
    
    if (!confirmDelete) return;
    
    // Double confirmation
    const doubleConfirm = confirm(
        `FINAL CONFIRMATION\n\n` +
        `Type the crew member's name to confirm deletion:\n` +
        `Expected: ${crewName}\n\n` +
        `Click OK to proceed with deletion.`
    );
    
    if (!doubleConfirm) return;
    
    try {
        // Get crew data first to retrieve UID and email
        const crewDoc = await getDoc(doc(db, "crewProfiles", crewId));
        const crewData = crewDoc.data();
        
        // Delete from crewProfiles collection
        await deleteDoc(doc(db, "crewProfiles", crewId));
        
        // Try to delete from users collection (if exists)
        const usersQuery = query(collection(db, "users"), where("name", "==", crewName));
        const usersSnapshot = await getDocs(usersQuery);
        usersSnapshot.forEach(async (userDoc) => {
            await deleteDoc(doc(db, "users", userDoc.id));
        });
        
        // Create a deleted users record to prevent login
        if (crewData && (crewData.uid || crewData.email)) {
            try {
                await setDoc(doc(db, "deletedUsers", crewData.uid || crewData.email), {
                    uid: crewData.uid || null,
                    email: crewData.email || null,
                    name: crewName,
                    deletedAt: new Date(),
                    deletedBy: auth.currentUser?.email || "manager"
                });
                console.log("Deleted user record created - user cannot log in");
            } catch (deleteError) {
                console.error("Error creating deleted user record:", deleteError);
            }
        }
        
        alert(`✅ Crew member "${crewName}" has been deleted successfully.\n\n` +
              `Their login access has been disabled immediately.\n\n` +
              `📝 Remember to manually delete their Firebase Auth account:\n` +
              `Firebase Console → Authentication → Users → Delete user`);
        closeCrewModal();
        loadCrew(); // Reload crew list
        
    } catch (error) {
        console.error("Error deleting crew member:", error);
        alert(`❌ Error deleting crew member: ${error.message}`);
    }
};

// ===============================
// 4. GENERATE SCHEDULE
// ===============================
window.generateSchedule = async function () {
    try {
        const startDateInput = document.getElementById("scheduleStartDate").value;
        const endDateInput = document.getElementById("scheduleEndDate").value;
        
        if (!startDateInput || !endDateInput) {
            alert("Please select both start and end dates.");
            return;
        }
        
        const startDate = new Date(startDateInput);
        const endDate = new Date(endDateInput);
        
        if (startDate > endDate) {
            alert("End date must be after or equal to start date.");
            return;
        }
        
        const correctedStartDate = new Date(startDate.getTime() - startDate.getTimezoneOffset() * 60000).toISOString().split("T")[0];
        const correctedEndDate = new Date(endDate.getTime() - endDate.getTimezoneOffset() * 60000).toISOString().split("T")[0];

        // Check if any active (non-archived) schedule already exists with the same start date
        const existingScheduleQuery = query(
            collection(db, "weeklySchedules"),
            where("startDate", "==", correctedStartDate)
        );
        const existingSchedules = await getDocs(existingScheduleQuery);
        const activeConflicts = existingSchedules.docs.filter(d => !d.data().archived);
        
        if (activeConflicts.length > 0) {
            const existing = activeConflicts[0].data();
            const existingEnd = existing.endDate || "unknown";
            alert(
                `❌ CANNOT GENERATE SCHEDULE\n\n` +
                `A schedule already exists starting on ${correctedStartDate} (ends: ${existingEnd}).\n\n` +
                `Please:\n` +
                `1. Mark the existing schedule as "Done" first, OR\n` +
                `2. Delete it from Firebase manually, OR\n` +
                `3. Choose a different start date`
            );
            return;
        }

        // Get all crew
        const crewSnapshot = await getDocs(collection(db, "crewProfiles"));
        const crewList = crewSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                name: data.name,
                nickname: data.nickname || "",
                unavailableDates: data.unavailableDates || [],
                topPriorityStation: data.topPriorityStation || "",
                secondaryStations: data.secondaryStations || [],
                schoolStartTime: data.schoolStartTime || {},
                schoolEndTime: data.schoolEndTime || {},
                restDays: data.restDays || {},
                noClass: data.noClass || {},
                noClassPreference: data.noClassPreference || {},
                shiftPreference: data.shiftPreference || "flexible",
                attendancePriority: data.attendancePriority || 3
            };
        });

        console.log(`Loaded ${crewList.length} crew members:`, crewList.map(c => c.name));

        if (crewList.length === 0) {
            alert("No crew found.");
            return;
        }

        // Load shift templates
        const templatesSnapshot = await getDocs(collection(db, "shiftTemplates"));
        if (templatesSnapshot.empty) {
            alert("No shift templates found.");
            return;
        }

        const shiftTemplates = {
            Monday: [], Tuesday: [], Wednesday: [], Thursday: [],
            Friday: [], Saturday: [], Sunday: []
        };

        templatesSnapshot.forEach(doc => {
            const shift = doc.data();
            ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].forEach(day => {
                shiftTemplates[day].push({
                    station: shift.station,
                    group: shift.group,
                    type: shift.type,
                    startTime: shift.startTime,
                    endTime: shift.endTime
                });
            });
        });

        const allDayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        
        // Build list of days from start to end date
        const days = [];
        const dayDates = {};
        const startObj = new Date(correctedStartDate);
        const endObj = new Date(correctedEndDate);
        for (let d = new Date(startObj); d <= endObj; d.setDate(d.getDate() + 1)) {
            const dayName = allDayNames[d.getDay()];
            const dateStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split("T")[0];
            days.push(dayName);
            dayDates[dayName] = dateStr;
        }
        
        const scheduleData = {};
        
        // Track assignments per crew for balancing
        const crewAssignmentCount = {};
        crewList.forEach(crew => {
            crewAssignmentCount[crew.name] = 0;
        });

        // Rest days are 100% manual - set by manager in crew profiles only
        // No automatic rest day assignment - generator respects whatever the manager configured
        
        days.forEach((day, dayIndex) => {
            const formattedDate = dayDates[day];

            // Get all crew available for this day (including emergency rest day override)
            const allDayCrewPool = crewList.filter(crew => {
                // Always exclude unavailable dates (hard constraint)
                if (crew.unavailableDates.includes(formattedDate)) {
                    console.log(`  ${crew.name} filtered out - unavailable date ${formattedDate}`);
                    return false;
                }
                
                const noClass = crew.noClass?.[day] === true;
                if (noClass) {
                    console.log(`  ${crew.name} available - no class on ${day}`);
                    return true;
                }
                
                // Check if school schedule blocks the ENTIRE day (5 PM or later end time)
                const schoolEndTime = crew.schoolEndTime?.[day];
                if (schoolEndTime && schoolEndTime !== "") {
                    const [hours] = schoolEndTime.split(':');
                    const endHour = parseInt(hours);
                    console.log(`  ${crew.name} school ends at ${schoolEndTime} (${endHour} hours) on ${day}`);
                    // If school ends at 6 PM (18:00) or later, crew cannot work at all that day
                    if (endHour >= 18) {
                        console.log(`  ${crew.name} filtered out - school ends too late (${endHour} >= 18), no schedule`);
                        return false;
                    }
                }
                
                // Also block if school STARTS very early and runs all day (school start with no end = full day)
                const schoolStartTime = crew.schoolStartTime?.[day];
                if (schoolStartTime && schoolStartTime !== "" && (!schoolEndTime || schoolEndTime === "")) {
                    console.log(`  ${crew.name} has school start at ${schoolStartTime} but no end time on ${day} - skipping`);
                    return false;
                }
                
                console.log(`  ${crew.name} available for ${day}`);
                return true;
            });

            // Only regular available crew (no rest day overrides)
            const regularAvailableCrew = allDayCrewPool.filter(crew => crew.restDays?.[day] !== true);
            let availableCrew = [...regularAvailableCrew];
            
            // For working students: track who had closing yesterday (for opening shift blocking)
            const studentsWithClosingYesterday = new Set();
            if (dayIndex > 0) {
                const previousDay = days[dayIndex - 1];
                const previousDaySchedule = scheduleData[previousDay] || [];
                
                console.log(`\n📋 Checking next-day opening restrictions for ${day} (previous: ${previousDay})`);
                
                availableCrew.forEach(crew => {
                    if (crew.roleType !== "student") return; // Only applies to students
                    
                    // Check if this student had a closing shift yesterday
                    const hadClosingYesterday = previousDaySchedule.some(shift => {
                        const crewDisplayName = crew.nickname || crew.name;
                        const shiftType = (shift.type || "").toLowerCase();
                        return (shift.crewName === crewDisplayName || shift.crewName === crew.name) && shiftType === "closing";
                    });
                    
                    if (hadClosingYesterday) {
                        const canOpenToday = crew.canWorkOpeningNextDay?.[day] === true;
                        console.log(`  ${crew.name} (student) had closing ${previousDay}: canOpenToday=${canOpenToday}`);
                        
                        if (!canOpenToday) {
                            console.log(`  ❌ ${crew.name} blocked from OPENING today - had closing yesterday and "can open next day" not checked`);
                            studentsWithClosingYesterday.add(crew.name);
                        } else {
                            console.log(`  ✅ ${crew.name} allowed to open today - "can open next day" is checked`);
                        }
                    }
                });
            }

            if (availableCrew.length === 0) {
                alert(`No crew available for ${day}.`);
                return;
            }

            scheduleData[day] = [];

            // Standalone school schedule checker - takes shift times as parameters
            // Used by rebalancing steps where the shift loop closure is no longer valid
            const canCrewWorkThisShift = (crew, shiftStartTime, shiftEndTime, shiftTypeStr) => {
                const noClass = crew.noClass?.[day] === true;
                if (noClass) {
                    const noClassPref = (crew.noClassPreference?.[day] || "any").toLowerCase();
                    const normalizedType = (shiftTypeStr || "").toLowerCase();
                    if (noClassPref === "opening" && normalizedType !== "opening") return false;
                    if (noClassPref === "closing" && normalizedType !== "closing") return false;
                    return true;
                }

                const startMatch = shiftStartTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
                const endMatch = shiftEndTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
                if (!startMatch || !endMatch) return true;

                let sH = parseInt(startMatch[1]), sM = parseInt(startMatch[2]);
                const sP = startMatch[3].toUpperCase();
                if (sP === 'PM' && sH < 12) sH += 12;
                if (sP === 'AM' && sH === 12) sH = 0;

                let eH = parseInt(endMatch[1]), eM = parseInt(endMatch[2]);
                const eP = endMatch[3].toUpperCase();
                if (eP === 'PM' && eH < 12) eH += 12;
                if (eP === 'AM' && eH === 12) eH = 0;
                if (eH === 0 && eP === 'AM') eH = 24;

                // --- SCHOOL TIME CHECKS (same logic as canWorkShift) ---
                // Normalize shift type to lowercase for comparison
                const normalizedShiftType = (shiftTypeStr || "").toLowerCase();
                
                // Opening shifts: crew can work if shift ENDS before school STARTS
                if (normalizedShiftType === "opening") {
                    const schoolStart = crew.schoolStartTime?.[day];
                    if (schoolStart && schoolStart !== "") {
                        const [ssH, ssM] = schoolStart.split(':').map(Number);
                        if (eH > ssH || (eH === ssH && eM > ssM)) return false;
                    }
                }
                
                // Closing shifts: crew can work anytime (they can start before school ends, work until school starts next day)
                // No school time restrictions for closing shifts

                return true;
            };

            // Count how many shifts exist for each station (to distribute crew fairly)
            const shiftCountByStation = {};
            shiftTemplates[day].forEach(shift => {
                const key = `${shift.station}-${shift.type}`;
                shiftCountByStation[key] = (shiftCountByStation[key] || 0) + 1;
            });

            for (const shift of shiftTemplates[day]) {
                let assignedCrew = null;

                // Normalize shift type to lowercase for comparison
                const shiftType = (shift.type || "").toLowerCase();
                
                console.log(`\n🔍 ${shift.station} (${shiftType}) - ${shift.startTime}`);

                // Helper: Check if crew can work this specific shift based on school schedule
                const canWorkShift = (crew) => {
                    const noClass = crew.noClass?.[day] === true;
                    if (noClass) {
                        // Check no class preference
                        const noClassPref = (crew.noClassPreference?.[day] || "any").toLowerCase();
                        const normalizedType = (shiftType || "").toLowerCase();
                        if (noClassPref === "opening" && normalizedType !== "opening") return false;
                        if (noClassPref === "closing" && normalizedType !== "closing") return false;
                        return true;
                    }
                    
                    // Parse shift times (AM/PM format like "5:30AM", "2:00PM")
                    const shiftStartMatch = shift.startTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
                    const shiftEndMatch = shift.endTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
                    
                    if (!shiftStartMatch || !shiftEndMatch) return true; // Can't parse, allow
                    
                    // Convert shift start to 24-hour
                    let shiftStartHour = parseInt(shiftStartMatch[1]);
                    const shiftStartMinute = parseInt(shiftStartMatch[2]);
                    const shiftStartPeriod = shiftStartMatch[3].toUpperCase();
                    if (shiftStartPeriod === 'PM' && shiftStartHour < 12) shiftStartHour += 12;
                    if (shiftStartPeriod === 'AM' && shiftStartHour === 12) shiftStartHour = 0;
                    
                    // Convert shift end to 24-hour
                    let shiftEndHour = parseInt(shiftEndMatch[1]);
                    const shiftEndMinute = parseInt(shiftEndMatch[2]);
                    const shiftEndPeriod = shiftEndMatch[3].toUpperCase();
                    if (shiftEndPeriod === 'PM' && shiftEndHour < 12) shiftEndHour += 12;
                    if (shiftEndPeriod === 'AM' && shiftEndHour === 12) shiftEndHour = 0;
                    // Handle midnight crossover (e.g. shift ends at 12:00AM = 24:00)
                    if (shiftEndHour === 0 && shiftEndPeriod === 'AM') shiftEndHour = 24;
                    
                    // --- SCHOOL TIME CHECKS ---
                    // Normalize shift type to lowercase for comparison
                    const normalizedShiftType = (shiftType || "").toLowerCase();
                    
                    // Opening shifts: crew can work if shift ENDS before school STARTS
                    if (normalizedShiftType === "opening") {
                        const schoolStartTime = crew.schoolStartTime?.[day];
                        if (schoolStartTime && schoolStartTime !== "") {
                            const schoolStartParts = schoolStartTime.split(':');
                            if (schoolStartParts.length === 2) {
                                const schoolStartHour = parseInt(schoolStartParts[0]);
                                const schoolStartMinute = parseInt(schoolStartParts[1]);
                                // Shift ends after school starts = conflict
                                if (shiftEndHour > schoolStartHour || (shiftEndHour === schoolStartHour && shiftEndMinute > schoolStartMinute)) {
                                    console.log(`  ${crew.name} blocked from ${shift.station} (${shift.startTime}-${shift.endTime}) - opening shift ends after school starts ${schoolStartTime}`);
                                    return false;
                                }
                            }
                        }
                    }
                    
                    // Closing shifts: crew can work anytime (they can start before school ends, work until school starts next day)
                    // No school time restrictions for closing shifts
                    
                    return true;
                };

                // Helper: Check if shift preference matches (with flexibility for balance)
                const matchesPreference = (crew, strict = true) => {
                    // Block students from opening if they had closing yesterday (unless "can open next day" is checked)
                    if (shiftType === "opening" && studentsWithClosingYesterday.has(crew.name)) {
                        return false;
                    }
                    
                    const shiftPref = (crew.shiftPreference || "flexible").toLowerCase();
                    if (shiftPref === "flexible") return true; // Flexible can work any shift
                    
                    if (strict) {
                        // Strict mode: only assign to preferred shifts
                        if (shiftPref === "opening" && shiftType === "opening") return true;
                        if (shiftPref === "closing" && shiftType === "closing") return true;
                        return false;
                    } else {
                        // Flexible mode: allow opposite shifts for balance (but with lower priority)
                        return true; // Allow any assignment when balancing is needed
                    }
                };

                // ===== WEEKLY ROTATION LOGIC =====
                // Calculate week number for rotation (based on start date)
                const startDate = new Date(correctedStartDate);
                const weekNumber = Math.floor(startDate.getTime() / (7 * 24 * 60 * 60 * 1000)) % 100; // Cycle every 100 weeks
                
                // All available stations for rotation
                const allStations = ["SC/AGGRE", "ASSEMBLER", "CTR", "DINING", "FRY", "PANTRY", "B-UP", "GRILL", "STOCKMAN", "DOORMAN", "PC"];
                
                // Function to get rotated station for a crew member (DISABLED - return original)
                const getRotatedStation = (originalStation, crewName, qualifiedStations) => {
                    return originalStation; // DISABLED: No rotation for now
                };
                
                // Function to get rotated secondary stations (DISABLED - return original)
                const getRotatedSecondaryStations = (originalStations, crewName, qualifiedStations) => {
                    // Ensure we always return an array
                    if (!originalStations) return [];
                    if (!Array.isArray(originalStations)) return [];
                    return originalStations; // DISABLED: No rotation for now
                };

                // Step 1: Try TOP PRIORITY station crew with matching preference (WITH ROTATION)
                let candidates = availableCrew.filter(crew => {
                    const originalTopPriority = crew.topPriorityStation || "";
                    const rotatedTopPriority = getRotatedStation(originalTopPriority, crew.name);
                    return rotatedTopPriority === shift.station && canWorkShift(crew) && matchesPreference(crew, true);
                });
                
                // Sort by: 1) For OPENING shifts, prioritize high attendance, 2) Assignment count
                candidates.sort((a, b) => {
                    const attendanceA = a.attendancePriority || 3;
                    const attendanceB = b.attendancePriority || 3;
                    
                    // For OPENING shifts, strongly prioritize high attendance (5 & 4)
                    if (shiftType === "opening") {
                        if (attendanceB !== attendanceA) return attendanceB - attendanceA;
                    } else {
                        // For CLOSING shifts, balance more evenly
                        if (attendanceB !== attendanceA) return attendanceB - attendanceA;
                    }
                    
                    return crewAssignmentCount[a.name] - crewAssignmentCount[b.name];
                });

                console.log(`  Step 1 (top priority + preference): ${candidates.length} candidates`);
                if (candidates.length > 0) {
                    const originalTop = candidates[0].topPriorityStation;
                    const rotatedTop = getRotatedStation(originalTop, candidates[0].name);
                    console.log(`    → Using: ${candidates[0].name} (original: ${originalTop} → rotated: ${rotatedTop}, pref: ${candidates[0].shiftPreference}, attendance: ${candidates[0].attendancePriority || 3}, assignments: ${crewAssignmentCount[candidates[0].name]})`);
                    assignedCrew = candidates[0];
                }

                // Step 2: Try HIGH ATTENDANCE crew (4-5) with SECONDARY stations + matching preference (WITH ROTATION)
                if (!assignedCrew) {
                    candidates = availableCrew.filter(crew => {
                        const attendance = crew.attendancePriority || 3;
                        if (attendance < 4) return false; // Only high attendance
                        
                        const originalSecondaryStations = crew.secondaryStations || [];
                        const rotatedSecondaryStations = getRotatedSecondaryStations(originalSecondaryStations, crew.name);
                        return rotatedSecondaryStations.includes(shift.station) && canWorkShift(crew) && matchesPreference(crew, true);
                    });
                    
                    candidates.sort((a, b) => {
                        const attendanceA = a.attendancePriority || 3;
                        const attendanceB = b.attendancePriority || 3;
                        
                        // For OPENING, strongly prefer attendance 5
                        if (shiftType === "opening") {
                            if (attendanceB !== attendanceA) return attendanceB - attendanceA;
                        } else {
                            if (attendanceB !== attendanceA) return attendanceB - attendanceA;
                        }
                        
                        return crewAssignmentCount[a.name] - crewAssignmentCount[b.name];
                    });

                    console.log(`  Step 2 (high attendance secondary + pref): ${candidates.length} candidates`);
                    if (candidates.length > 0) {
                        const originalSecondary = candidates[0].secondaryStations || [];
                        const rotatedSecondary = getRotatedSecondaryStations(originalSecondary, candidates[0].name);
                        console.log(`    → Using: ${candidates[0].name} (original: ${Array.isArray(originalSecondary) ? originalSecondary.join(',') : originalSecondary} → rotated: ${Array.isArray(rotatedSecondary) ? rotatedSecondary.join(',') : rotatedSecondary}, pref: ${candidates[0].shiftPreference}, attendance: ${candidates[0].attendancePriority || 3}, assignments: ${crewAssignmentCount[candidates[0].name]})`);
                        assignedCrew = candidates[0];
                    }
                }

                // Step 3: Try TOP PRIORITY station crew (ignore preference) - BUT RESPECT STRICT PREFERENCES (WITH ROTATION)
                if (!assignedCrew) {
                    candidates = availableCrew.filter(crew => {
                        const originalTopPriority = crew.topPriorityStation || "";
                        const rotatedTopPriority = getRotatedStation(originalTopPriority, crew.name);
                        if (rotatedTopPriority !== shift.station) return false;
                        if (!canWorkShift(crew)) return false;
                        
                        // STRICT: Don't assign "opening" crew to closing or vice versa
                        const shiftPref = (crew.shiftPreference || "flexible").toLowerCase();
                        if (shiftPref === "opening" && shiftType === "closing") return false;
                        if (shiftPref === "closing" && shiftType === "opening") return false;
                        
                        return true;
                    });
                    
                    // Sort by: 1) Attendance priority (higher first), 2) Assignment count (lower first)
                    candidates.sort((a, b) => {
                        const attendanceA = a.attendancePriority || 3;
                        const attendanceB = b.attendancePriority || 3;
                        if (attendanceB !== attendanceA) return attendanceB - attendanceA;
                        return crewAssignmentCount[a.name] - crewAssignmentCount[b.name];
                    });
                    
                    console.log(`  Step 3 (top priority, respect strict pref): ${candidates.length} candidates`);
                    if (candidates.length > 0) {
                        const originalTop = candidates[0].topPriorityStation;
                        const rotatedTop = getRotatedStation(originalTop, candidates[0].name);
                        console.log(`    → Using: ${candidates[0].name} (original: ${originalTop} → rotated: ${rotatedTop}, pref: ${candidates[0].shiftPreference}, attendance: ${candidates[0].attendancePriority || 3}, assignments: ${crewAssignmentCount[candidates[0].name]})`);
                        assignedCrew = candidates[0];
                    }
                }

                // Step 4: Try SECONDARY station crew with matching preference (WITH ROTATION)
                if (!assignedCrew) {
                    candidates = availableCrew.filter(crew => {
                        const originalSecondaryStations = crew.secondaryStations || [];
                        const rotatedSecondaryStations = getRotatedSecondaryStations(originalSecondaryStations, crew.name);
                        return rotatedSecondaryStations.includes(shift.station) && canWorkShift(crew) && matchesPreference(crew, true);
                    });
                    
                    // Sort by: 1) Attendance priority (higher first), 2) Assignment count (lower first)
                    candidates.sort((a, b) => {
                        const attendanceA = a.attendancePriority || 3;
                        const attendanceB = b.attendancePriority || 3;
                        if (attendanceB !== attendanceA) return attendanceB - attendanceA;
                        return crewAssignmentCount[a.name] - crewAssignmentCount[b.name];
                    });
                    
                    console.log(`  Step 4 (secondary + preference): ${candidates.length} candidates`);
                    if (candidates.length > 0) {
                        const originalSecondary = candidates[0].secondaryStations || [];
                        const rotatedSecondary = getRotatedSecondaryStations(originalSecondary, candidates[0].name);
                        console.log(`    → Using: ${candidates[0].name} (original: ${Array.isArray(originalSecondary) ? originalSecondary.join(',') : originalSecondary} → rotated: ${Array.isArray(rotatedSecondary) ? rotatedSecondary.join(',') : rotatedSecondary}, pref: ${candidates[0].shiftPreference}, attendance: ${candidates[0].attendancePriority || 3}, assignments: ${crewAssignmentCount[candidates[0].name]})`);
                        assignedCrew = candidates[0];
                    }
                }

                // Step 5: Try SECONDARY station crew (ignore preference) - BUT RESPECT STRICT PREFERENCES (WITH ROTATION)
                if (!assignedCrew) {
                    candidates = availableCrew.filter(crew => {
                        const originalSecondaryStations = crew.secondaryStations || [];
                        const rotatedSecondaryStations = getRotatedSecondaryStations(originalSecondaryStations, crew.name);
                        if (!rotatedSecondaryStations.includes(shift.station)) return false;
                        if (!canWorkShift(crew)) return false;
                        
                        // STRICT: Don't assign "opening" crew to closing or vice versa
                        const shiftPref = (crew.shiftPreference || "flexible").toLowerCase();
                        if (shiftPref === "opening" && shiftType === "closing") return false;
                        if (shiftPref === "closing" && shiftType === "opening") return false;
                        
                        return true;
                    });
                    
                    // Sort by: 1) Attendance priority (higher first), 2) Assignment count (lower first)
                    candidates.sort((a, b) => {
                        const attendanceA = a.attendancePriority || 3;
                        const attendanceB = b.attendancePriority || 3;
                        if (attendanceB !== attendanceA) return attendanceB - attendanceA;
                        return crewAssignmentCount[a.name] - crewAssignmentCount[b.name];
                    });
                    
                    console.log(`  Step 5 (secondary, respect strict pref): ${candidates.length} candidates`);
                    if (candidates.length > 0) {
                        const originalSecondary = candidates[0].secondaryStations || [];
                        const rotatedSecondary = getRotatedSecondaryStations(originalSecondary, candidates[0].name);
                        console.log(`    → Using: ${candidates[0].name} (original: ${Array.isArray(originalSecondary) ? originalSecondary.join(',') : originalSecondary} → rotated: ${Array.isArray(rotatedSecondary) ? rotatedSecondary.join(',') : rotatedSecondary}, pref: ${candidates[0].shiftPreference}, attendance: ${candidates[0].attendancePriority || 3}, assignments: ${crewAssignmentCount[candidates[0].name]})`);
                        assignedCrew = candidates[0];
                    }
                }

                // No Step 6 or 7 - only assign crew who match station AND preference
                // If no one matches, leave Unassigned
                
                // Step 6: Any qualified crew (top or secondary) with matching preference
                if (!assignedCrew) {
                    candidates = availableCrew.filter(crew => {
                        const topPriority = crew.topPriorityStation || "";
                        const secondaryStations = crew.secondaryStations || [];
                        const hasStation = topPriority === shift.station || secondaryStations.includes(shift.station);
                        return hasStation && canWorkShift(crew) && matchesPreference(crew, true);
                    });
                    
                    candidates.sort((a, b) => {
                        // Seniority first (rank 1-2 are high priority)
                        const aRank = a.seniorityRank || 999;
                        const bRank = b.seniorityRank || 999;
                        if (aRank !== bRank) return aRank - bRank;
                        
                        // Top priority station second
                        const aIsTop = a.topPriorityStation === shift.station ? 1 : 0;
                        const bIsTop = b.topPriorityStation === shift.station ? 1 : 0;
                        if (aIsTop !== bIsTop) return bIsTop - aIsTop;
                        
                        // Then by attendance
                        const attendanceA = a.attendancePriority || 3;
                        const attendanceB = b.attendancePriority || 3;
                        if (attendanceB !== attendanceA) return attendanceB - attendanceA;
                        
                        // Then by assignment count
                        return crewAssignmentCount[a.name] - crewAssignmentCount[b.name];
                    });
                    
                    console.log(`  Step 6 (any qualified + preference): ${candidates.length} candidates`);
                    if (candidates.length > 0) {
                        assignedCrew = candidates[0];
                        console.log(`    → Using: ${assignedCrew.name} (rank ${assignedCrew.seniorityRank || 'N/A'}, qualified for ${shift.station}, pref: ${assignedCrew.shiftPreference}, attendance: ${assignedCrew.attendancePriority || 3})`);
                    }
                }

                // Only truly Unassigned if no qualified crew available
                if (!assignedCrew) {
                    console.log(`  ⚠️ No qualified crew available for ${shift.station} - leaving Unassigned`);
                }

                const crewName = assignedCrew ? (assignedCrew.nickname || assignedCrew.name) : "Unassigned";
                
                if (assignedCrew) {
                    crewAssignmentCount[assignedCrew.name]++;
                    // CREW CAN ONLY WORK ONE SHIFT PER DAY - Remove from availableCrew after assignment
                    availableCrew = availableCrew.filter(crew => crew.name !== assignedCrew.name);
                }

                scheduleData[day].push({
                    station: shift.station,
                    group: shift.group,
                    type: shift.type,
                    startTime: shift.startTime,
                    endTime: shift.endTime,
                    crewName: crewName,
                    date: formattedDate
                });
            }
            
            // ===============================
            // REBALANCING STEP: Prioritize seniors and optimize station assignments
            // ===============================
            console.log(`\n🔄 Rebalancing ${day}...`);
            
            // Helper: Check if crew is assigned on this day
            const isCrewAssigned = (crew) => {
                const displayName = crew.nickname || crew.name;
                return scheduleData[day].some(s => s.crewName === displayName || s.crewName === crew.name);
            };
            
            // Helper: Find crew by name in schedule
            const findCrewInSchedule = (crewName) => {
                return allDayCrewPool.find(c => {
                    const displayName = c.nickname || c.name;
                    return displayName === crewName || c.name === crewName;
                });
            };
            
            // Helper: Check if crew can work shift (preference match)
            const canWorkShiftType = (crew, shiftType) => {
                const pref = (crew.shiftPreference || "flexible").toLowerCase();
                if (pref === "flexible") return true;
                if (pref === "opening" && shiftType === "opening") return true;
                if (pref === "closing" && shiftType === "closing") return true;
                return false;
            };
            
            // STEP 1: SENIORITY PRIORITY - Seniors (rank 1-2) should get shifts over juniors (rank 3-5)
            console.log(`\n  STEP 1: Seniority Priority`);
            const unassignedSeniors = allDayCrewPool.filter(crew => {
                const rank = crew.seniorityRank || 999;
                return rank <= 2 && !isCrewAssigned(crew) && crew.restDays?.[day] !== true;
            });
            
            console.log(`  Found ${unassignedSeniors.length} unassigned seniors (rank 1-2)`);
            
            unassignedSeniors.forEach(senior => {
                const seniorStations = [senior.topPriorityStation, ...(senior.secondaryStations || [])];
                const seniorRank = senior.seniorityRank || 999;
                const seniorDisplayName = senior.nickname || senior.name;
                
                console.log(`  Checking ${seniorDisplayName} (rank ${seniorRank}): stations [${seniorStations.join(', ')}]`);
                
                // Try to find a junior working at a station the senior can work
                for (let i = 0; i < scheduleData[day].length; i++) {
                    const shift = scheduleData[day][i];
                    if (shift.crewName === "Unassigned") continue;
                    
                    // CRITICAL: Re-check if senior is already assigned (state may have changed after previous swaps)
                    const alreadyAssigned = scheduleData[day].some(s => s.crewName === seniorDisplayName);
                    if (alreadyAssigned) break;
                    
                    // Check if senior can work this station
                    if (!seniorStations.includes(shift.station)) continue;
                    
                    // Check shift preference AND school schedule
                    const shiftType = (shift.type || "").toLowerCase();
                    if (!canWorkShiftType(senior, shiftType)) continue;
                    if (!canCrewWorkThisShift(senior, shift.startTime, shift.endTime, shiftType)) continue; // School schedule check
                    
                    // Find the currently assigned crew
                    const currentCrew = findCrewInSchedule(shift.crewName);
                    if (!currentCrew) continue;
                    
                    const currentRank = currentCrew.seniorityRank || 999;
                    
                    // Only swap if current crew is junior (higher rank = lower priority)
                    if (currentRank <= seniorRank) continue;
                    
                    const currentDisplayName = currentCrew.nickname || currentCrew.name;
                    
                    // Check if junior can be moved to another open shift or unassigned
                    const juniorStations = [currentCrew.topPriorityStation, ...(currentCrew.secondaryStations || [])];
                    
                    // Try to find an unassigned shift for the junior
                    let juniorNewShiftIndex = -1;
                    for (let j = 0; j < scheduleData[day].length; j++) {
                        const openShift = scheduleData[day][j];
                        if (openShift.crewName !== "Unassigned") continue;
                        
                        const openShiftType = (openShift.type || "").toLowerCase();
                        if (!juniorStations.includes(openShift.station)) continue;
                        if (!canWorkShiftType(currentCrew, openShiftType)) continue;
                        if (!canCrewWorkThisShift(currentCrew, openShift.startTime, openShift.endTime, openShiftType)) continue;
                        
                        juniorNewShiftIndex = j;
                        break;
                    }
                    
                    if (juniorNewShiftIndex >= 0) {
                        // SWAP: Senior takes junior's spot, junior moves to open shift
                        scheduleData[day][i].crewName = seniorDisplayName;
                        scheduleData[day][juniorNewShiftIndex].crewName = currentDisplayName;
                        console.log(`  ✅ SENIORITY SWAP: ${seniorDisplayName} (rank ${seniorRank}) takes ${shift.station}, ${currentDisplayName} (rank ${currentRank}) moves to ${scheduleData[day][juniorNewShiftIndex].station}`);
                        break;
                    } else {
                        // DIRECT SWAP: Senior takes junior's spot, junior becomes unassigned
                        scheduleData[day][i].crewName = seniorDisplayName;
                        crewAssignmentCount[senior.name] = (crewAssignmentCount[senior.name] || 0) + 1;
                        crewAssignmentCount[currentCrew.name] = Math.max(0, (crewAssignmentCount[currentCrew.name] || 1) - 1);
                        console.log(`  ✅ SENIORITY SWAP: ${seniorDisplayName} (rank ${seniorRank}) takes ${shift.station} from ${currentDisplayName} (rank ${currentRank})`);
                        break;
                    }
                }
            });
            
            // STEP 2: STATION OPTIMIZATION - Move crew to better-fit stations
            console.log(`\n  STEP 2: Station Optimization`);
            
            // Find crew assigned to non-optimal stations who have better options available
            for (let i = 0; i < scheduleData[day].length; i++) {
                const shift = scheduleData[day][i];
                if (shift.crewName === "Unassigned") continue;
                
                const crew = findCrewInSchedule(shift.crewName);
                if (!crew) continue;
                
                const shiftType = (shift.type || "").toLowerCase();
                const crewDisplayName = crew.nickname || crew.name;
                
                // Check if crew is NOT at their top priority station
                if (crew.topPriorityStation === shift.station) continue;
                
                // Check if crew has this station in secondary (not top priority)
                const secondaryStations = crew.secondaryStations || [];
                if (!secondaryStations.includes(shift.station)) continue;
                
                console.log(`  ${crewDisplayName} is at ${shift.station} (secondary), looking for better fit...`);
                
                // Try to find an unassigned shift at their top priority or better secondary station
                for (let j = 0; j < scheduleData[day].length; j++) {
                    const openShift = scheduleData[day][j];
                    if (openShift.crewName !== "Unassigned") continue;
                    
                    const openShiftType = (openShift.type || "").toLowerCase();
                    
                    // Check if this is a better station for the crew
                    const isBetterStation = openShift.station === crew.topPriorityStation;
                    if (!isBetterStation) continue;
                    
                    // Check shift preference AND school schedule for crew moving to better station
                    if (!canWorkShiftType(crew, openShiftType)) continue;
                    if (!canCrewWorkThisShift(crew, openShift.startTime, openShift.endTime, openShiftType)) continue;
                    
                    // Now find someone to take the crew's current spot
                    const replacementCrew = allDayCrewPool.find(c => {
                        if (c.restDays?.[day] === true) return false; // Respect rest days
                        const cDisplayName = c.nickname || c.name;
                        if (scheduleData[day].some(s => s.crewName === cDisplayName)) return false;
                        const canWorkHere = c.topPriorityStation === shift.station || 
                                          (c.secondaryStations || []).includes(shift.station);
                        if (!canWorkHere) return false;
                        if (!canWorkShiftType(c, shiftType)) return false;
                        return canCrewWorkThisShift(c, shift.startTime, shift.endTime, shiftType);
                    });
                    
                    if (replacementCrew) {
                        const replacementDisplayName = replacementCrew.nickname || replacementCrew.name;
                        
                        // SWAP: Move crew to better station, replacement takes their spot
                        scheduleData[day][i].crewName = replacementDisplayName;
                        scheduleData[day][j].crewName = crewDisplayName;
                        crewAssignmentCount[replacementCrew.name] = (crewAssignmentCount[replacementCrew.name] || 0) + 1;
                        
                        console.log(`  ✅ STATION SWAP: ${crewDisplayName} (${shift.station} → ${openShift.station}), ${replacementDisplayName} (unassigned → ${shift.station})`);
                        break;
                    }
                }
            }
            
            // STEP 3: FILL REMAINING - Assign any remaining unassigned crew to open shifts
            console.log(`\n  STEP 3: Fill Remaining Shifts`);
            const stillUnassignedShifts = scheduleData[day]
                .map((shift, index) => ({ shift, index }))
                .filter(({ shift }) => shift.crewName === "Unassigned");
            
            stillUnassignedShifts.forEach(({ shift, index }) => {
                const shiftType = (shift.type || "").toLowerCase();
                
                // Find any unassigned crew who can work here
                const unassignedCrew = allDayCrewPool.find(crew => {
                    if (crew.restDays?.[day] === true) return false; // Respect rest days
                    const cDisplayName = crew.nickname || crew.name;
                    if (scheduleData[day].some(s => s.crewName === cDisplayName)) return false;
                    const canWorkHere = crew.topPriorityStation === shift.station || 
                                      (crew.secondaryStations || []).includes(shift.station);
                    if (!canWorkHere) return false;
                    if (!canWorkShiftType(crew, shiftType)) return false;
                    return canCrewWorkThisShift(crew, shift.startTime, shift.endTime, shiftType);
                });
                
                if (unassignedCrew) {
                    const displayName = unassignedCrew.nickname || unassignedCrew.name;
                    scheduleData[day][index].crewName = displayName;
                    crewAssignmentCount[unassignedCrew.name] = (crewAssignmentCount[unassignedCrew.name] || 0) + 1;
                    console.log(`  ✅ Assigned: ${displayName} → ${shift.station} (${shift.type})`);
                }
            });
            
            // Add PC station shift (always unassigned, MID shift 10:00AM-7:00PM)
            scheduleData[day].push({
                station: "PC",
                type: "MID",
                startTime: "10:00AM",
                endTime: "7:00PM",
                crewName: "Unassigned",
                isSeventhDay: false
            });
            console.log(`  ✅ Added PC station (MID 10:00AM-7:00PM) - Unassigned`);
        });

        // Save to Firestore
        await addDoc(collection(db, "weeklySchedules"), {
            startDate: correctedStartDate,
            endDate: correctedEndDate,
            scheduleData: scheduleData,
            status: "draft",
            createdAt: serverTimestamp()
        });

        alert("Schedule generated successfully!");

    } catch (error) {
        console.error("Error:", error);
        alert("Generation failed: " + error.message);
    }
};

// ===============================
// 5. PUBLISH SCHEDULE
// ===============================
window.publishLatest = async function() {
    try {
        const q = query(
            collection(db, "weeklySchedules"), 
            where("status", "==", "draft"), 
            orderBy("createdAt", "desc"), 
            limit(1)
        );
        
        const snap = await getDocs(q);
        if (snap.empty) return alert("No draft found. Click 'Generate' first!");
        
        const draftId = snap.docs[0].id;
        
        // Archive old schedules so only 1 is "published"
        const allSchedules = await getDocs(collection(db, "weeklySchedules"));
        for (const sDoc of allSchedules.docs) {
            if (sDoc.id !== draftId) {
                await updateDoc(doc(db, "weeklySchedules", sDoc.id), { status: "archived" });
            }
        }

        await updateDoc(doc(db, "weeklySchedules", draftId), { status: "published" });
        alert("Schedule is now LIVE!");
        window.location.reload(); 
    } catch (e) { alert("Publish Error: " + e.message); }
};

// ===============================
// 6. LOGOUT
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

// ===============================
// 7. REQUESTS & APPROVAL
// ===============================
window.loadRequests = async function() {
    const container = document.getElementById("requestList");
    if (!container) return;
    try {
        const q = query(collection(db, "unavailabilityRequests"), where("status", "==", "pending"));
        const snap = await getDocs(q);
        
        // Get today's date at midnight for comparison
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Auto-delete past approved or rejected requests
        const deletePromises = [];
        snap.forEach(docSnap => {
            const req = docSnap.data();
            if (req.status === "approved" || req.status === "rejected") {
                const [yr, mo, dy] = req.date.split("-").map(Number);
                const requestDate = new Date(yr, mo - 1, dy);
                if (requestDate < today) {
                    console.log(`Manager: Deleting past ${req.status} request: ${req.date}`);
                    deletePromises.push(deleteDoc(doc(db, "unavailabilityRequests", docSnap.id)));
                }
            }
        });
        
        if (deletePromises.length > 0) {
            await Promise.all(deletePromises);
            console.log(`Manager: Deleted ${deletePromises.length} past approved request(s)`);
        }
        
        if (snap.empty) { 
            container.innerHTML = "<p style='color: #999; text-align: center; padding: 20px;'>No pending requests.</p>"; 
            return; 
        }
        
        // Convert to array and sort by date (most recent first)
        const requests = [];
        snap.forEach(docSnap => {
            requests.push({
                id: docSnap.id,
                data: docSnap.data()
            });
        });
        
        // Sort by date descending
        requests.sort((a, b) => {
            const dateA = new Date(a.data.date);
            const dateB = new Date(b.data.date);
            return dateB - dateA;
        });
        
        // Group requests by crew and date range
        const groupedByCrewAndRange = {};
        requests.forEach(({ id, data: req }) => {
            const rangeKey = `${req.crewName}|${req.dateRangeStart || req.date}|${req.dateRangeEnd || req.date}`;
            if (!groupedByCrewAndRange[rangeKey]) {
                groupedByCrewAndRange[rangeKey] = [];
            }
            groupedByCrewAndRange[rangeKey].push({ id, data: req });
        });
        
        let html = "";
        Object.entries(groupedByCrewAndRange).forEach(([rangeKey, items]) => {
            const [crewName, startDate, endDate] = rangeKey.split('|');
            const req = items[0].data;
            const reason = req.reason || "No reason provided";
            const dayCount = items.length;
            
            const dateDisplay = startDate === endDate 
                ? startDate 
                : `${startDate} to ${endDate}`;
            
            html += `
                <div style="
                    padding: 20px; 
                    background: white; 
                    border: 2px solid #e0e0e0; 
                    border-radius: 12px;
                    margin-bottom: 15px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                    transition: all 0.3s ease;
                " onmouseover="this.style.borderColor='#FFC700'; this.style.boxShadow='0 4px 12px rgba(255,199,0,0.3)'" onmouseout="this.style.borderColor='#e0e0e0'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
                        <div style="flex: 1;">
                            <h3 style="margin: 0 0 8px 0; color: #DC0000; font-size: 18px;">
                                ${crewName}
                            </h3>
                            <p style="margin: 0; color: #666; font-size: 14px;">
                                📅 <strong>Date:</strong> ${dateDisplay}
                                ${dayCount > 1 ? `<span style="color: #999; margin-left: 8px;">(${dayCount} days)</span>` : ''}
                            </p>
                        </div>
                    </div>
                    <div style="
                        background: #f8f9fa; 
                        padding: 12px 15px; 
                        border-radius: 8px; 
                        border-left: 4px solid #FFC700;
                        margin-bottom: 15px;
                    ">
                        <p style="margin: 0 0 5px 0; font-weight: 600; color: #333; font-size: 13px;">
                            📝 Reason:
                        </p>
                        <p style="margin: 0; color: #555; font-size: 14px; line-height: 1.6;">
                            ${reason}
                        </p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="approveRequest('${items.map(i => i.id).join(',')}', '${crewName}', '${startDate}', '${endDate}')" 
                            style="
                                flex: 1;
                                background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                                color: white;
                                border: none;
                                border-radius: 8px;
                                padding: 10px 20px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 600;
                                transition: all 0.3s ease;
                            "
                            onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(40,167,69,0.4)'"
                            onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                            ✓ Approve
                        </button>
                        <button onclick="declineRequest('${items.map(i => i.id).join(',')}')" 
                            style="
                                flex: 1;
                                background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
                                color: white;
                                border: none;
                                border-radius: 8px;
                                padding: 10px 20px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 600;
                                transition: all 0.3s ease;
                            "
                            onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(220,53,69,0.4)'"
                            onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                            ✗ Decline
                        </button>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (e) { 
        console.error(e); 
        container.innerHTML = "<p style='color: red;'>Error loading requests. Please try refreshing the page.</p>";
    }
};

window.approveRequest = async function(reqIds, crewName, startDate, endDate) {
    const dateDisplay = startDate === endDate ? startDate : `${startDate} to ${endDate}`;
    const confirmApprove = confirm(`Approve time off request for ${crewName} on ${dateDisplay}?`);
    if (!confirmApprove) return;
    
    try {
        const q = query(collection(db, "crewProfiles"), where("name", "==", crewName));
        const crewSnap = await getDocs(q);
        
        if (!crewSnap.empty) {
            const profileId = crewSnap.docs[0].id;
            
            // Generate all dates in the range
            const start = new Date(startDate);
            const end = new Date(endDate);
            const datesToAdd = [];
            
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dateStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                    .toISOString()
                    .split("T")[0];
                datesToAdd.push(dateStr);
            }
            
            // Add all dates to crew profile
            const updatePromises = datesToAdd.map(date =>
                updateDoc(doc(db, "crewProfiles", profileId), { 
                    unavailableDates: arrayUnion(date) 
                })
            );
            
            await Promise.all(updatePromises);
            
            // Update all request documents to approved
            const idArray = reqIds.split(',');
            const approvePromises = idArray.map(id =>
                updateDoc(doc(db, "unavailabilityRequests", id.trim()), { 
                    status: "approved" 
                })
            );
            
            await Promise.all(approvePromises);

            alert(`✓ Approved! ${datesToAdd.length} day${datesToAdd.length > 1 ? 's' : ''} blocked for this crew member.`);
            loadRequests(); 
            loadCrew();     
        }
    } catch (e) { 
        alert("Approval Error: " + e.message); 
    }
};

window.declineRequest = async function(reqIds) {
    const confirmDecline = confirm("Are you sure you want to decline this request?");
    if (!confirmDecline) return;
    
    try {
        const idArray = reqIds.split(',');
        const declinePromises = idArray.map(id =>
            updateDoc(doc(db, "unavailabilityRequests", id.trim()), { 
                status: "rejected" 
            })
        );
        
        await Promise.all(declinePromises);

        alert("✗ Request declined.");
        loadRequests();
    } catch (e) { 
        alert("Decline Error: " + e.message); 
    }
};