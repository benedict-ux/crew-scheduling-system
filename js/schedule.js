import { db } from "./firebase-config.js";
import { auth } from "./firebase-config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let fullScheduleData = {};
let scheduleStartDate = null;
let allCrewData = []; // Store crew data globally for dropdown updates

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

window.loadSchedule = async function () {

    const container = document.getElementById("scheduleContainer");
    if (!container) return;

    container.innerHTML = "Loading schedule...";

    try {

        // 🔥 Load latest PUBLISHED and NON-ARCHIVED schedule
        const q = query(
            collection(db, "weeklySchedules"),
            where("status", "==", "published"),
            orderBy("createdAt", "desc")
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = "<p>No published schedule available.</p>";
            return;
        }

        // Filter out archived schedules
        let scheduleDoc = null;
        for (const doc of snapshot.docs) {
            if (!doc.data().archived) {
                scheduleDoc = doc;
                break;
            }
        }

        if (!scheduleDoc) {
            container.innerHTML = "<p>No active published schedule available. Check History for archived schedules.</p>";
            return;
        }

        scheduleStartDate = scheduleDoc.data().startDate;
        fullScheduleData = scheduleDoc.data().scheduleData;

        // 🔥 Load crew
        const crewSnapshot = await getDocs(collection(db, "crewProfiles"));
        const crewData = crewSnapshot.docs.map(doc => doc.data());
        allCrewData = crewData; // Store globally for dropdown updates

        container.innerHTML = "";

        const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

        days.forEach((day, dayIndex) => {

            // ✅ Safe PH date conversion
            const parts = scheduleStartDate.split("-");
            const baseDate = new Date(parts[0], parts[1] - 1, parts[2]);

            const currentDayObj = new Date(baseDate);
            currentDayObj.setDate(baseDate.getDate() + dayIndex);

            const formattedDate = new Date(
                currentDayObj.getTime() - currentDayObj.getTimezoneOffset() * 60000
            ).toISOString().split("T")[0];

            // 🔥 Filter crew for this specific day
            const availableCrewForDay = crewData.filter(crew => {
                // Check rest days
                if (crew.restDays?.[day] === true) {
                    return false;
                }
                
                // Check unavailable dates
                const unavailableDates = crew.unavailableDates || [];
                if (unavailableDates.includes(formattedDate)) {
                    return false;
                }
                
                // Check if "No Class" - if yes, crew is available regardless of school times
                const noClass = crew.noClass?.[day] === true;
                if (noClass) {
                    return true; // No class = available to work
                }
                
                // Check school end time - if 8:00 PM (20:00) or later, crew is unavailable
                const schoolEndTime = crew.schoolEndTime?.[day];
                if (schoolEndTime && schoolEndTime !== "") {
                    const [hours, minutes] = schoolEndTime.split(':');
                    const endHour = parseInt(hours);
                    
                    // If school ends at 20:00 (8 PM) or later, can't work
                    if (endHour >= 20) {
                        return false;
                    }
                }
                
                return true;
            });

            // Group shifts by station - EXACT ORDER FROM TEMPLATE
            const stationOrder = ["SC/AGGRE", "ASSEMBLER", "CTR", "DINING", "FRY", "PANTRY", "B-UP", "TD2", "GRILL", "STOCKMAN", "DOORMAN", "GUARD", "PC"];
            const shiftsByStation = {};
            
            fullScheduleData[day].forEach((shift, shiftIndex) => {
                if (!shiftsByStation[shift.station]) {
                    shiftsByStation[shift.station] = [];
                }
                shiftsByStation[shift.station].push({ ...shift, originalIndex: shiftIndex });
            });
            
            // Sort shifts within each station: OPENING first, then CLOSING
            Object.keys(shiftsByStation).forEach(station => {
                shiftsByStation[station].sort((a, b) => {
                    const typeA = (a.type || "").toUpperCase();
                    const typeB = (b.type || "").toUpperCase();
                    
                    if (typeA === "OPENING" && typeB === "CLOSING") return -1;
                    if (typeA === "CLOSING" && typeB === "OPENING") return 1;
                    
                    // If same type, sort by start time
                    return a.startTime.localeCompare(b.startTime);
                });
            });

            container.innerHTML += `
                <div id="day-${day}" class="day-container">
                    <h2>${day}</h2>
                    <h3>DATE: ${formattedDate}</h3>
                    
                    <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
                    <table class="schedule-table">
                        <thead>
                            <tr>
                                <th style="text-align: left; width: 12%;">STATION</th>
                                <th style="text-align: left; width: 20%;">NAME</th>
                                <th style="text-align: center; width: 15%;">TIME</th>
                                <th style="text-align: center; width: 8%;">15</th>
                                <th style="text-align: center; width: 8%;">30</th>
                                <th style="text-align: center; width: 8%;">60</th>
                                <th style="text-align: center; width: 8%;">15</th>
                                <th style="text-align: center; width: 21%;">SIGNATURE</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${stationOrder.map(stationName => {
                                const shifts = shiftsByStation[stationName] || [];
                                if (shifts.length === 0) return '';
                                
                                return shifts.map((shift, idx) => {
                                    // For PC station, show ALL crew with PC as top priority or secondary station
                                    let dropdownCrew;
                                    if (stationName === "PC") {
                                        dropdownCrew = crewData.filter(crew => {
                                            const hasPCStation = crew.topPriorityStation === "PC" || (crew.secondaryStations || []).includes("PC");
                                            return hasPCStation; // Show all crew with PC station
                                        });
                                    } else {
                                        // Show ALL crew members for all other stations
                                        dropdownCrew = crewData;
                                    }
                                    
                                    // Main row + 1 blank row
                                    return `
                                        <tr>
                                            ${idx === 0 ? `<td rowspan="${shifts.length * 2}" style="font-weight: bold; vertical-align: top; background: #f8f9fa;">${stationName}</td>` : ''}
                                            <td>
                                                <select id="shift-${day}-${shift.originalIndex}" 
                                                    onchange="updateDropdownsForDay('${day}')" 
                                                    onfocus="this.dataset.oldValue = this.value"
                                                    onkeydown="preventArrowKeyChange(event, this)">
                                                    <option value="Unassigned" ${shift.crewName === "Unassigned" ? "selected" : ""}>Unassigned</option>
                                                    ${dropdownCrew.map(crew => {
                                                        const crewDisplayName = crew.nickname || crew.name;
                                                        return `<option value="${crewDisplayName}" ${crewDisplayName === shift.crewName || crew.name === shift.crewName ? "selected" : ""}>
                                                            ${crewDisplayName}
                                                        </option>`;
                                                    }).join("")}
                                                </select>
                                            </td>
                                            <td style="text-align: center; white-space: nowrap;">${shift.startTime}-${shift.endTime}</td>
                                            <td style="background: #fafafa;"></td>
                                            <td style="background: #fafafa;"></td>
                                            <td style="background: #fafafa;"></td>
                                            <td style="background: #fafafa;"></td>
                                            <td style="background: #fafafa;"></td>
                                        </tr>
                                        <tr class="blank-row">
                                            <td></td>
                                            <td></td>
                                            <td style="background: #fafafa;"></td>
                                            <td style="background: #fafafa;"></td>
                                            <td style="background: #fafafa;"></td>
                                            <td style="background: #fafafa;"></td>
                                            <td style="background: #fafafa;"></td>
                                        </tr>
                                    `;
                                }).join('');
                            }).join('')}
                        </tbody>
                    </table>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 15px; gap: 20px; flex-wrap: wrap;">
                        <div class="reminder-box" style="flex: 1; min-width: 250px; margin: 0;">
                            <p style="font-weight: bold; margin: 0 0 8px 0;">ASK YOUR TL IF THERE'S CORRECTION</p>
                            <p style="margin: 3px 0;">DON'T BE LATE</p>
                            <p style="margin: 3px 0;">EXCESSIVE LATE WILL DO IR AND REPORT TO JAFRA</p>
                            <p style="margin: 3px 0;">PLEASE CALL STORE OR SEND MESSAGE IN OUR</p>
                            <p style="margin: 3px 0;">FOR NO CALL, MUST PRESENT A MEDICAL CERTIFICATE</p>
                            <p style="margin: 3px 0;">REQUEST MUST BE DONE 3 DAYS PRIOR THE DAY OF THE REQUEST</p>
                        </div>
                        
                        <div class="save-button-container" style="display: flex; flex-direction: column; align-items: flex-end; gap: 10px;">
                            <button onclick="saveDayChanges('${day}')" style="white-space: nowrap;">
                                💾 Save ${day} Changes
                            </button>
                            <span id="save-status-${day}" style="font-weight: bold; font-size: 14px;"></span>
                        </div>
                    </div>
                </div>
            `;
        });

    } catch (error) {
        console.error("Error loading schedule:", error);
        container.innerHTML = "<p>Error loading schedule.</p>";
    }
};



// Prevent accidental changes from arrow keys
window.preventArrowKeyChange = function(event, selectElement) {
    // Block arrow keys (up, down, left, right) unless dropdown is open
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || 
        event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        
        // Check if dropdown is actually open (size > 1 means it's expanded)
        if (selectElement.size <= 1) {
            event.preventDefault();
            return false;
        }
    }
};

// Update dropdowns in real-time when a crew is assigned (without saving to database)
window.updateDropdownsForDay = function(day) {
    // Get current assignments from the dropdowns (not from database)
    const currentAssignments = [];
    fullScheduleData[day].forEach((shift, shiftIndex) => {
        const selectElement = document.getElementById(`shift-${day}-${shiftIndex}`);
        if (selectElement) {
            currentAssignments.push({
                index: shiftIndex,
                crewName: selectElement.value,
                station: shift.station
            });
        }
    });
    
    // Check for double bookings and show warning
    const crewAssignments = {};
    currentAssignments.forEach(assignment => {
        if (assignment.crewName !== "Unassigned") {
            if (!crewAssignments[assignment.crewName]) {
                crewAssignments[assignment.crewName] = [];
            }
            crewAssignments[assignment.crewName].push(assignment.station);
        }
    });
    
    // Show warning for double-booked crew
    const doubleBooked = Object.keys(crewAssignments).filter(crew => crewAssignments[crew].length > 1);
    
    // Remove existing warning banner if present
    const existingWarning = document.getElementById(`warning-banner-${day}`);
    if (existingWarning) {
        existingWarning.remove();
    }
    
    if (doubleBooked.length > 0) {
        const warnings = doubleBooked.map(crew => `<strong>${crew}</strong>: ${crewAssignments[crew].join(', ')}`).join('<br>');
        console.warn(`⚠️ DOUBLE BOOKING WARNING on ${day}:\n${doubleBooked.map(crew => `${crew}: ${crewAssignments[crew].join(', ')}`).join('\n')}`);
        
        // Create floating warning banner in center of screen
        const warningBanner = document.createElement('div');
        warningBanner.id = `warning-banner-${day}`;
        warningBanner.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #fff3cd 0%, #ffe8a1 100%);
            border: 4px solid #ff9800;
            border-radius: 15px;
            padding: 25px 30px;
            box-shadow: 0 10px 40px rgba(255, 152, 0, 0.5);
            z-index: 9999;
            max-width: 500px;
            animation: popIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        `;
        warningBanner.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 60px; margin-bottom: 10px;">⚠️</div>
                <h2 style="margin: 0 0 15px 0; color: #ff6f00; font-size: 24px; font-weight: bold;">
                    DOUBLE BOOKING WARNING
                </h2>
                <p style="margin: 0 0 15px 0; color: #333; font-size: 16px; line-height: 1.8;">
                    The following crew members are assigned to multiple stations:
                </p>
                <div style="
                    background: white;
                    border: 2px solid #ff9800;
                    border-radius: 8px;
                    padding: 15px;
                    margin-bottom: 20px;
                    text-align: left;
                    font-size: 15px;
                    line-height: 1.8;
                ">
                    ${warnings}
                </div>
                <button onclick="this.parentElement.parentElement.remove()" style="
                    background: #ff9800;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    padding: 12px 30px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: bold;
                    box-shadow: 0 4px 10px rgba(255, 152, 0, 0.3);
                    transition: all 0.2s;
                " onmouseover="this.style.background='#f57c00'; this.style.transform='scale(1.05)'" 
                   onmouseout="this.style.background='#ff9800'; this.style.transform='scale(1)'">
                    ✓ I Understand
                </button>
            </div>
        `;
        
        // Add to body instead of day container
        document.body.appendChild(warningBanner);
        
        // Also show in status span
        const statusSpan = document.getElementById(`save-status-${day}`);
        if (statusSpan) {
            statusSpan.textContent = `⚠️ Warning: ${doubleBooked.join(', ')} assigned to multiple stations`;
            statusSpan.style.color = "#ff9800";
        }
    } else {
        // Clear warning if no double bookings
        const statusSpan = document.getElementById(`save-status-${day}`);
        if (statusSpan && statusSpan.textContent.includes('Warning')) {
            statusSpan.textContent = "";
        }
    }
    
    // Update each dropdown based on station type
    currentAssignments.forEach(assignment => {
        const selectElement = document.getElementById(`shift-${day}-${assignment.index}`);
        if (!selectElement) return;
        
        const currentValue = selectElement.value;
        
        // Rebuild dropdown
        let optionsHtml = `<option value="Unassigned" ${currentValue === "Unassigned" ? "selected" : ""}>Unassigned</option>`;
        
        // For PC station, only show crew with PC as top priority or secondary
        if (assignment.station === "PC") {
            allCrewData.forEach(crew => {
                const hasPCStation = crew.topPriorityStation === "PC" || (crew.secondaryStations || []).includes("PC");
                if (hasPCStation) {
                    const crewDisplayName = crew.nickname || crew.name;
                    
                    // Check if crew is already assigned elsewhere
                    const isDoubleBooked = crewAssignments[crewDisplayName] && crewAssignments[crewDisplayName].length > 1;
                    const label = isDoubleBooked ? `${crewDisplayName} ⚠️` : crewDisplayName;
                    
                    optionsHtml += `<option value="${crewDisplayName}" ${crewDisplayName === currentValue ? "selected" : ""}>${label}</option>`;
                }
            });
        } else {
            // Add ALL crew members to other station dropdowns
            allCrewData.forEach(crew => {
                const crewDisplayName = crew.nickname || crew.name;
                
                // Check if crew is already assigned elsewhere
                const isDoubleBooked = crewAssignments[crewDisplayName] && crewAssignments[crewDisplayName].length > 1;
                const label = isDoubleBooked ? `${crewDisplayName} ⚠️` : crewDisplayName;
                
                optionsHtml += `<option value="${crewDisplayName}" ${crewDisplayName === currentValue ? "selected" : ""}>${label}</option>`;
            });
        }
        
        selectElement.innerHTML = optionsHtml;
    });
};

window.saveDayChanges = async function(day) {
    try {
        const statusSpan = document.getElementById(`save-status-${day}`);
        statusSpan.textContent = "Saving...";
        statusSpan.style.color = "#007bff";

        if (!scheduleStartDate) return;

        // Get latest published schedule
        const q = query(
            collection(db, "weeklySchedules"),
            where("status", "==", "published"),
            orderBy("createdAt", "desc"),
            limit(1)
        );

        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            statusSpan.textContent = "❌ No schedule found";
            statusSpan.style.color = "#dc3545";
            return;
        }

        const scheduleDoc = snapshot.docs[0];
        const docRef = scheduleDoc.ref;
        const scheduleData = scheduleDoc.data().scheduleData;

        // Get all crew data for validation
        const crewSnapshot = await getDocs(collection(db, "crewProfiles"));
        const crewData = crewSnapshot.docs.map(doc => doc.data());

        // Build correct shift date for this day
        const parts = scheduleStartDate.split("-");
        const baseDate = new Date(parts[0], parts[1] - 1, parts[2]);
        const dayIndex = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].indexOf(day);
        const currentDayObj = new Date(baseDate);
        currentDayObj.setDate(baseDate.getDate() + dayIndex);
        const dateStr = new Date(
            currentDayObj.getTime() - currentDayObj.getTimezoneOffset() * 60000
        ).toISOString().split("T")[0];

        // Update all shifts for this day from the dropdowns
        let hasError = false;
        scheduleData[day].forEach((shift, shiftIndex) => {
            const selectElement = document.getElementById(`shift-${day}-${shiftIndex}`);
            if (selectElement) {
                const newCrewName = selectElement.value;
                
                // Validate if crew is unavailable on this date
                if (newCrewName !== "Unassigned") {
                    const crew = crewData.find(c => c.name === newCrewName);
                    if (crew) {
                        const unavailableDates = crew.unavailableDates || [];
                        if (unavailableDates.includes(dateStr)) {
                            statusSpan.textContent = `❌ ${newCrewName} is unavailable on ${dateStr}`;
                            statusSpan.style.color = "#dc3545";
                            hasError = true;
                            return;
                        }
                    }
                }
                
                scheduleData[day][shiftIndex].crewName = newCrewName;
            }
        });

        if (hasError) return;

        // Save to Firestore
        await updateDoc(docRef, {
            scheduleData: scheduleData
        });

        // Update the local data
        fullScheduleData = scheduleData;

        statusSpan.textContent = "✅ Saved!";
        statusSpan.style.color = "#28a745";
        
        // Clear success message after 3 seconds
        setTimeout(() => {
            statusSpan.textContent = "";
        }, 3000);

    } catch (error) {
        console.error("Error saving changes:", error);
        const statusSpan = document.getElementById(`save-status-${day}`);
        statusSpan.textContent = "❌ Save failed";
        statusSpan.style.color = "#dc3545";
    }
};



// ===============================
// LOGOUT
// ===============================
window.logout = async function() {
    const confirmLogout = confirm("Are you sure you want to logout?");
    if (!confirmLogout) return;
    
    try {
        await signOut(auth);
        window.location.href = "login.html";
    } catch (e) {
        console.error("Error logging out:", e);
        alert("Error logging out. Please try again.");
    }
};
