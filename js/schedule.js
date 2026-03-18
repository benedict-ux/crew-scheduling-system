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
    updateDoc,
    deleteDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let fullScheduleData = {};
let scheduleStartDate = null;
let allCrewData = []; // Store crew data globally for dropdown updates
let approvedDates = {}; // Store approved unavailability dates globally

// Auto-delete past unavailability requests and clean up crewProfiles.unavailableDates
async function cleanupPastUnavailability() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        // 1. Delete past approved/rejected requests from unavailabilityRequests
        const snap = await getDocs(query(
            collection(db, "unavailabilityRequests"),
            where("status", "in", ["approved", "rejected"])
        ));
        const deletePromises = [];
        snap.forEach(docSnap => {
            const req = docSnap.data();
            const [yr, mo, dy] = req.date.split("-").map(Number);
            if (new Date(yr, mo - 1, dy) < today) {
                deletePromises.push(deleteDoc(doc(db, "unavailabilityRequests", docSnap.id)));
            }
        });
        if (deletePromises.length > 0) await Promise.all(deletePromises);

        // 2. Remove past dates from crewProfiles.unavailableDates
        const crewSnap = await getDocs(collection(db, "crewProfiles"));
        const crewUpdatePromises = [];
        crewSnap.forEach(crewDoc => {
            const data = crewDoc.data();
            const dates = data.unavailableDates || [];
            const futureDates = dates.filter(d => {
                const [yr, mo, dy] = d.split("-").map(Number);
                return new Date(yr, mo - 1, dy) >= today;
            });
            if (futureDates.length !== dates.length) {
                crewUpdatePromises.push(updateDoc(doc(db, "crewProfiles", crewDoc.id), { unavailableDates: futureDates }));
            }
        });
        if (crewUpdatePromises.length > 0) await Promise.all(crewUpdatePromises);

        console.log("Cleanup done: past unavailability removed.");
    } catch (e) {
        console.warn("Cleanup error:", e.message);
    }
}

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
        // Auto-cleanup past unavailability on every schedule page load
        await cleanupPastUnavailability();
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

        // 🔥 Load approved unavailability requests - only current/future dates
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const approvedRequestsSnapshot = await getDocs(query(
            collection(db, "unavailabilityRequests"),
            where("status", "==", "approved")
        ));
        approvedDates = {};
        approvedRequestsSnapshot.forEach(doc => {
            const req = doc.data();
            const [yr, mo, dy] = req.date.split("-").map(Number);
            const reqDate = new Date(yr, mo - 1, dy);
            if (reqDate < today) return; // skip past requests
            if (!approvedDates[req.date]) {
                approvedDates[req.date] = [];
            }
            approvedDates[req.date].push(req.crewName);
            console.log(`Approved: ${req.crewName} on ${req.date}`);
        });
        console.log("Approved dates:", approvedDates);

        container.innerHTML = "";

        // Get schedule end date (fallback to 7 days if not available)
        const scheduleEndDate = scheduleDoc.data().endDate;
        
        // Generate array of dates from start to end
        const startDateObj = new Date(scheduleStartDate);
        const endDateObj = scheduleEndDate ? new Date(scheduleEndDate) : new Date(startDateObj.getTime() + 6 * 24 * 60 * 60 * 1000);
        
        const datesInRange = [];
        for (let d = new Date(startDateObj); d <= endDateObj; d.setDate(d.getDate() + 1)) {
            const dateStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split("T")[0];
            datesInRange.push(dateStr);
        }

        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

        datesInRange.forEach((dateStr, dayIndex) => {
            const currentDayObj = new Date(dateStr);
            const dayName = dayNames[currentDayObj.getDay()];
            const formattedDate = dateStr;

            // 🔥 Filter crew for this specific day
            const availableCrewForDay = crewData.filter(crew => {
                // Check rest days
                if (crew.restDays?.[dayName] === true) {
                    return false;
                }
                
                // Check unavailable dates
                const unavailableDates = crew.unavailableDates || [];
                if (unavailableDates.includes(formattedDate)) {
                    return false;
                }
                
                // Check if "No Class" - if yes, crew is available regardless of school times
                const noClass = crew.noClass?.[dayName] === true;
                if (noClass) {
                    return true; // No class = available to work
                }
                
                // If school ends at 6 PM (18:00) or later, crew cannot work at all that day
                const schoolEndTime = crew.schoolEndTime?.[dayName];
                if (schoolEndTime && schoolEndTime !== "") {
                    const endHour = parseInt(schoolEndTime.split(':')[0]);
                    if (endHour >= 18) {
                        return false; // School ends too late, no schedule
                    }
                }
                
                return true;
            });

            // Group shifts by station - EXACT ORDER FROM TEMPLATE WITH 3 MID STATIONS
            const stationOrder = ["SC/AGGRE", "ASSEMBLER", "CTR", "MID", "DINING", "MID-DINING", "MID-KITCHEN", "FRY", "PANTRY", "B-UP", "GRILL", "STOCKMAN", "DOORMAN", "PC"];
            const shiftsByStation = {};
            
            fullScheduleData[dayName].forEach((shift, shiftIndex) => {
                if (!shiftsByStation[shift.station]) {
                    shiftsByStation[shift.station] = [];
                }
                shiftsByStation[shift.station].push({ ...shift, originalIndex: shiftIndex });
            });
            
            // Sort shifts within each station: OPENING first, then MID, then CLOSING
            Object.keys(shiftsByStation).forEach(station => {
                shiftsByStation[station].sort((a, b) => {
                    const typeA = (a.type || "").toUpperCase();
                    const typeB = (b.type || "").toUpperCase();
                    
                    if (typeA === "OPENING" && typeB === "MID") return -1;
                    if (typeA === "OPENING" && typeB === "CLOSING") return -1;
                    if (typeA === "MID" && typeB === "OPENING") return 1;
                    if (typeA === "MID" && typeB === "CLOSING") return -1;
                    if (typeA === "CLOSING" && typeB === "OPENING") return 1;
                    if (typeA === "CLOSING" && typeB === "MID") return 1;
                    
                    // If same type, sort by start time
                    return a.startTime.localeCompare(b.startTime);
                });
            });

            // Add 3 separate MID stations
            // 1. Service MID (between CTR and DINING)
            if (!shiftsByStation["MID"]) {
                shiftsByStation["MID"] = [{
                    station: "MID",
                    type: "MID",
                    startTime: "12:00PM",
                    endTime: "8:00PM",
                    crewName: "Unassigned",
                    originalIndex: -1
                }];
            }
            
            // 2. Dining MID (after DINING)
            if (!shiftsByStation["MID-DINING"]) {
                shiftsByStation["MID-DINING"] = [{
                    station: "MID-DINING",
                    type: "MID",
                    startTime: "12:00PM",
                    endTime: "8:00PM",
                    crewName: "Unassigned",
                    originalIndex: -2
                }];
            }
            
            // 3. Kitchen MID (after FRY)
            if (!shiftsByStation["MID-KITCHEN"]) {
                shiftsByStation["MID-KITCHEN"] = [{
                    station: "MID-KITCHEN",
                    type: "MID",
                    startTime: "12:00PM",
                    endTime: "8:00PM",
                    crewName: "Unassigned",
                    originalIndex: -3
                }];
            }

            // Format date for print header e.g. "MARCH 16, 2026 (MONDAY)"
            const monthNames = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
            const printDateLabel = `DATE: ${monthNames[currentDayObj.getMonth()]} ${currentDayObj.getDate()}, ${currentDayObj.getFullYear()} (${dayName.toUpperCase()})`;

            container.innerHTML += `
                <div id="day-${dayName}" class="day-container">
                    <h2>${dayName}</h2>
                    <h3>DATE: ${formattedDate}</h3>

                    <!-- Print-only header -->
                    <div class="print-header">
                        <div class="print-header-date">${printDateLabel}</div>
                        <div class="print-header-branch">JOLLIBEE EDSA KAMIAS</div>
                    </div>
                    
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
                                    let dropdownCrew;
                                    if (stationName === "PC") {
                                        dropdownCrew = crewData.filter(crew => {
                                            const hasPCStation = crew.topPriorityStation === "PC" || (crew.secondaryStations || []).includes("PC");
                                            return hasPCStation;
                                        });
                                    } else {
                                        dropdownCrew = crewData;
                                    }
                                    
                                    // Filter out crew with approved unavailability requests for this date
                                    const unavailableCrewNames = approvedDates[formattedDate] || [];
                                    if (formattedDate === "2026-03-16" || unavailableCrewNames.length > 0) {
                                        console.log(`📅 Date: ${formattedDate}, Unavailable: ${unavailableCrewNames.join(", ")}`);
                                    }
                                    const crewBeforeFilter = dropdownCrew.length;
                                    dropdownCrew = dropdownCrew.filter(crew => {
                                        const crewDisplayName = crew.nickname || crew.name;
                                        const crewFullName = crew.name;
                                        // Check both display name and full name
                                        const isUnavailable = unavailableCrewNames.includes(crewDisplayName) || unavailableCrewNames.includes(crewFullName);
                                        if (isUnavailable) {
                                            console.log(`✅ Filtering out: ${crewDisplayName} (full: ${crewFullName}) on ${formattedDate}`);
                                        }
                                        return !isUnavailable;
                                    });
                                    if (crewBeforeFilter !== dropdownCrew.length) {
                                        console.log(`✅ Filtered ${crewBeforeFilter - dropdownCrew.length} crew member(s) for ${formattedDate}`);
                                    }
                                    
                                    const shiftId = shift.originalIndex === -1 ? 
                                        `mid-${dayName}-${stationName}` : 
                                        `shift-${dayName}-${shift.originalIndex}`;
                                    
                                    const hideWhenUnassigned = ["PC", "MID", "MID-DINING", "MID-KITCHEN"];
                                    const isUnassigned = shift.crewName === "Unassigned";
                                    const shouldHideClass = hideWhenUnassigned.includes(stationName) && isUnassigned ? 'hide-if-unassigned' : '';

                                    // rowspan * 2 covers all shift rows + blank rows (original working approach)
                                    const stationCell = idx === 0
                                        ? `<td rowspan="${shifts.length * 2}" class="print-station-cell" style="font-weight:bold;vertical-align:middle;background:#f8f9fa;color:#DC0000;">${stationName}</td>`
                                        : '';

                                    return `
                                        <tr class="${shouldHideClass}">
                                            ${stationCell}
                                            <td class="print-name-cell">
                                                <select id="${shiftId}" 
                                                    onchange="updateDropdownsForDay('${dayName}')" 
                                                    onfocus="this.dataset.oldValue = this.value"
                                                    onkeydown="preventArrowKeyChange(event, this)">
                                                    <option value="Unassigned" ${isUnassigned ? "selected" : ""}>Unassigned</option>
                                                    ${dropdownCrew.map(crew => {
                                                        const crewDisplayName = crew.nickname || crew.name;
                                                        const isSelected = crewDisplayName === shift.crewName || crew.name === shift.crewName;
                                                        return `<option value="${crewDisplayName}" ${isSelected ? "selected" : ""}>${crewDisplayName}</option>`;
                                                    }).join("")}
                                                </select>
                                            </td>
                                            <td style="text-align:center;white-space:nowrap;min-width:130px;">${shift.startTime}-${shift.endTime}</td>
                                            <td style="background:#fafafa;"></td>
                                            <td style="background:#fafafa;"></td>
                                            <td style="background:#fafafa;"></td>
                                            <td style="background:#fafafa;"></td>
                                            <td style="background:#fafafa;"></td>
                                        </tr>
                                        <tr class="blank-row ${shouldHideClass}">
                                            <td colspan="7" style="padding:4px;border:1px solid #eee;"><input type="text" class="blank-input" style="width:100%;border:none;background:transparent;font-size:12px;padding:2px;font-family:inherit;"></td>
                                        </tr>
                                    `;
                                }).join('');
                            }).join('')}
                        </tbody>
                    </table>
                    </div>

                    <!-- Print-only footer reminders -->
                    <div class="print-footer">
                        <table>
                            <tr>
                                <td class="bold-cell" style="width:55%;">ACKNOWLEDGE OF YOUR SCHED</td>
                                <td rowspan="6" class="yellow-cell" style="width:45%; vertical-align:middle;">BEE HAPPY! :)</td>
                            </tr>
                            <tr><td class="bold-cell red-text">ASK YOUR TL IF THERE'S CORRECTION</td></tr>
                            <tr><td class="bold-cell">DON'T BE LATE</td></tr>
                            <tr><td class="bold-cell">EXCESSIVE LATE WILL DO IR AND REPORT TO JAFRA</td></tr>
                            <tr><td class="bold-cell">PLEASE CALL STORE OR DROP MESSAGE IN OUR GC</td></tr>
                            <tr><td class="bold-cell">FOR NO CALL, MUST PRESENT A MEDICAL CERTIFICATE</td></tr>
                            <tr>
                                <td class="bold-cell red-text" colspan="2">PLEASE LONG BREAK IF SLACK</td>
                            </tr>
                            <tr>
                                <td colspan="2" class="bold-cell">REQUEST MUST BE DONE 3 DAYS PRIOR THE DAY OF THE REQUEST</td>
                            </tr>
                        </table>
                    </div>
                    
                    <div style="display: flex; justify-content: flex-start; align-items: flex-start; margin-top: 15px; gap: 20px; flex-wrap: wrap;">
                        <div class="reminder-box" style="flex: 0 0 auto; min-width: 250px; max-width: 400px; margin: 0; text-align: left; border: 3px solid #FFC700; background: #fff9e6;">
                            <p style="font-weight: bold; margin: 0 0 8px 0; text-align: left; color: #DC0000;">ASK YOUR TL IF THERE'S CORRECTION</p>
                            <p style="margin: 3px 0; text-align: left;">DON'T BE LATE</p>
                            <p style="margin: 3px 0; text-align: left;">EXCESSIVE LATE WILL DO IR AND REPORT TO JAFRA</p>
                            <p style="margin: 3px 0; text-align: left;">PLEASE CALL STORE OR SEND MESSAGE IN OUR GC</p>
                            <p style="margin: 3px 0; text-align: left;">FOR NO CALL, MUST PRESENT A MEDICAL CERTIFICATE</p>
                            <p style="margin: 3px 0; text-align: left;">REQUEST MUST BE DONE 3 DAYS PRIOR THE DAY OF THE REQUEST</p>
                        </div>
                        
                        <div class="save-button-container" style="display: flex; flex-direction: column; align-items: flex-start; gap: 10px; margin-left: auto;">
                            <button onclick="saveDayChanges('${dayName}')" style="white-space: nowrap;">
                                💾 Save ${dayName} Changes
                            </button>
                            <span id="save-status-${dayName}" style="font-weight: bold; font-size: 14px;"></span>
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
    
    // Handle regular shifts
    fullScheduleData[day].forEach((shift, shiftIndex) => {
        const selectElement = document.getElementById(`shift-${day}-${shiftIndex}`);
        if (selectElement) {
            currentAssignments.push({
                index: shiftIndex,
                crewName: selectElement.value,
                station: shift.station,
                type: 'regular'
            });
        }
    });
    
    // Handle all 3 Mid shifts
    const midStations = ["MID", "MID-DINING", "MID-KITCHEN"];
    midStations.forEach(midStation => {
        const midSelectElement = document.getElementById(`mid-${day}-${midStation}`);
        if (midSelectElement) {
            currentAssignments.push({
                index: midStation === "MID" ? -1 : (midStation === "MID-DINING" ? -2 : -3),
                crewName: midSelectElement.value,
                station: midStation,
                type: 'mid'
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
        const selectId = assignment.type === 'mid' ? 
            `mid-${day}-${assignment.station}` : 
            `shift-${day}-${assignment.index}`;
        const selectElement = document.getElementById(selectId);
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
                    
                    // Check if crew has approved unavailability for this date
                    const dayIndex = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(day);
                    const baseDateParts = scheduleStartDate.split("-");
                    const baseDate = new Date(baseDateParts[0], baseDateParts[1] - 1, baseDateParts[2]);
                    const currentDayObj = new Date(baseDate);
                    currentDayObj.setDate(baseDate.getDate() + dayIndex);
                    const formattedDate = new Date(
                        currentDayObj.getTime() - currentDayObj.getTimezoneOffset() * 60000
                    ).toISOString().split("T")[0];
                    
                    // Check both display name and full name against approved dates
                    const unavailableNames = approvedDates[formattedDate] || [];
                    const isUnavailable = unavailableNames.includes(crewDisplayName) || unavailableNames.includes(crew.name);
                    if (isUnavailable) return; // Skip this crew
                    
                    // Check if crew is already assigned elsewhere
                    const isDoubleBooked = crewAssignments[crewDisplayName] && crewAssignments[crewDisplayName].length > 1;
                    const label = isDoubleBooked ? `${crewDisplayName} ⚠️` : crewDisplayName;
                    optionsHtml += `<option value="${crewDisplayName}" ${crewDisplayName === currentValue ? "selected" : ""}>${label}</option>`;
                }
            });
        } else {
            // Add crew members to other station dropdowns (excluding unavailable)
            const dayIndex = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(day);
            const baseDateParts = scheduleStartDate.split("-");
            const baseDate = new Date(baseDateParts[0], baseDateParts[1] - 1, baseDateParts[2]);
            const currentDayObj = new Date(baseDate);
            currentDayObj.setDate(baseDate.getDate() + dayIndex);
            const formattedDate = new Date(
                currentDayObj.getTime() - currentDayObj.getTimezoneOffset() * 60000
            ).toISOString().split("T")[0];
            
            allCrewData.forEach(crew => {
                const crewDisplayName = crew.nickname || crew.name;
                
                // Check if crew has approved unavailability for this date
                const unavailableNames = approvedDates[formattedDate] || [];
                const isUnavailable = unavailableNames.includes(crewDisplayName) || unavailableNames.includes(crew.name);
                if (isUnavailable) return; // Skip this crew
                
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
