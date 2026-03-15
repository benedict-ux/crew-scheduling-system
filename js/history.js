import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    collection, getDocs, query, where, orderBy, updateDoc, doc, deleteDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Auth check
onAuthStateChanged(auth, (user) => {
    if (user) {
        setTimeout(() => {
            loadHistory();
        }, 200);
    } else {
        window.location.href = "login.html";
    }
});

// Load completed schedules
window.loadHistory = async function() {
    const historyContainer = document.getElementById("historyList");
    if (!historyContainer) return;
    
    console.log("Loading schedule history...");
    
    try {
        // Load all schedules and filter in JavaScript
        const allSchedulesQuery = query(
            collection(db, "weeklySchedules"),
            orderBy("startDate", "desc")
        );
        
        const allSchedulesSnapshot = await getDocs(allSchedulesQuery);
        
        // Filter for archived schedules
        const archivedSchedules = [];
        allSchedulesSnapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.archived === true) {
                archivedSchedules.push({ id: docSnap.id, data });
            }
        });
        
        console.log(`Found ${archivedSchedules.length} archived schedules`);
        
        if (archivedSchedules.length === 0) {
            historyContainer.innerHTML = '<p style="color: #999; text-align: center; padding: 40px;">No completed schedules yet.</p>';
            return;
        }
        
        let html = '<div style="display: grid; gap: 15px;">';
        
        archivedSchedules.forEach(({ id: scheduleId, data }) => {
            const startDate = data.startDate;
            
            // Calculate end date (Sunday)
            const start = new Date(startDate);
            const end = new Date(start);
            end.setDate(start.getDate() + 6);
            const endDate = end.toISOString().split('T')[0];
            
            const published = data.published ? '✅ Published' : '⏳ Draft';
            const archivedDate = data.archivedAt ? new Date(data.archivedAt.seconds * 1000).toLocaleDateString() : 'Unknown';
            
            html += `
                <div style="
                    background: white;
                    border: 2px solid #e0e0e0;
                    border-radius: 8px;
                    padding: 20px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h3 style="margin: 0 0 10px 0; color: #333;">
                                📅 ${startDate} to ${endDate}
                            </h3>
                            <p style="margin: 5px 0; color: #666; font-size: 14px;">
                                <strong>Status:</strong> ${published}
                            </p>
                            <p style="margin: 5px 0; color: #666; font-size: 14px;">
                                <strong>Archived:</strong> ${archivedDate}
                            </p>
                        </div>
                        <div>
                            <button onclick="viewScheduleModal('${scheduleId}')" style="
                                background: #007bff;
                                color: white;
                                border: none;
                                border-radius: 5px;
                                padding: 10px 20px;
                                cursor: pointer;
                                font-size: 14px;
                                margin-right: 10px;
                            ">View</button>
                            <button onclick="restoreSchedule('${scheduleId}')" style="
                                background: #28a745;
                                color: white;
                                border: none;
                                border-radius: 5px;
                                padding: 10px 20px;
                                cursor: pointer;
                                font-size: 14px;
                                margin-right: 10px;
                            ">Restore</button>
                            <button onclick="deleteSchedule('${scheduleId}', '${startDate}')" style="
                                background: #dc3545;
                                color: white;
                                border: none;
                                border-radius: 5px;
                                padding: 10px 20px;
                                cursor: pointer;
                                font-size: 14px;
                            ">Delete</button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        historyContainer.innerHTML = html;
        
    } catch (e) {
        console.error("Error loading history:", e);
        historyContainer.innerHTML = '<p style="color: red; text-align: center; padding: 20px;">Error loading history. Check console for details.</p>';
    }
};

// View schedule details (you can expand this later)
window.viewScheduleDetails = function(scheduleId) {
    alert(`Schedule details for ID: ${scheduleId}\n\nThis feature can be expanded to show full schedule details.`);
};

// View schedule in modal
window.viewScheduleModal = async function(scheduleId) {
    try {
        const scheduleDoc = await getDoc(doc(db, "weeklySchedules", scheduleId));
        if (!scheduleDoc.exists()) {
            alert("Schedule not found!");
            return;
        }
        
        const scheduleData = scheduleDoc.data();
        const startDate = scheduleData.startDate;
        const scheduleByDay = scheduleData.scheduleData;
        
        // Station order (matches schedule.js)
        const stationOrder = [
            "SC/AGGRE", "ASSEMBLER", "CTR", "MID", "DINING", "MID-DINING",
            "MID-KITCHEN", "FRY", "PANTRY", "B-UP", "GRILL", "STOCKMAN", "DOORMAN", "PC"
        ];
        
        const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        
        let modalHtml = `
            <div id="scheduleModal" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 9999;
                overflow: auto;
                padding: 20px;
            " onclick="if(event.target.id === 'scheduleModal') closeScheduleModal()">
                <div style="
                    background: white;
                    border-radius: 15px;
                    padding: 30px;
                    width: 95%;
                    max-width: 1200px;
                    max-height: 90vh;
                    overflow: auto;
                    position: relative;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                " onclick="event.stopPropagation()">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
                        <h2 style="margin: 0; color: #DC0000; font-size: 24px;">📅 Schedule: ${startDate}</h2>
                        <div style="display: flex; gap: 10px;">
                            <button onclick="printScheduleModal()" style="
                                background: linear-gradient(135deg, #FFC700 0%, #FFB000 100%);
                                color: #333;
                                border: none;
                                border-radius: 8px;
                                padding: 10px 20px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 600;
                                box-shadow: 0 2px 8px rgba(255, 199, 0, 0.3);
                                transition: all 0.3s ease;
                            " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(255,199,0,0.5)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(255,199,0,0.3)'">🖨️ Print</button>
                            <button onclick="closeScheduleModal()" style="
                                background: linear-gradient(135deg, #6c757d 0%, #5a6268 100%);
                                color: white;
                                border: none;
                                border-radius: 8px;
                                padding: 10px 20px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 600;
                                box-shadow: 0 2px 8px rgba(108, 117, 125, 0.3);
                                transition: all 0.3s ease;
                            " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(108,117,125,0.5)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(108,117,125,0.3)'">✕ Close</button>
                        </div>
                    </div>
                    
                    <div id="scheduleModalContent">
        `;
        
        // Generate schedule for each day
        days.forEach((day, dayIndex) => {
            const daySchedule = scheduleByDay[day] || [];
            
            // Calculate date for this day
            const baseDateParts = startDate.split("-");
            const baseDate = new Date(baseDateParts[0], baseDateParts[1]-1, baseDateParts[2]);
            const currentDate = new Date(baseDate);
            currentDate.setDate(baseDate.getDate() + dayIndex);
            const formattedDate = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            // Build print header label e.g. "DATE: MARCH 2, 2026 (MONDAY)"
            const monthNames = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
            const printDateLabel = `DATE: ${monthNames[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()} (${day.toUpperCase()})`;

            // Group shifts by station
            const shiftsByStation = {};
            daySchedule.forEach(shift => {
                if (!shiftsByStation[shift.station]) shiftsByStation[shift.station] = [];
                shiftsByStation[shift.station].push(shift);
            });

            // Sort within each station: OPENING → MID → CLOSING → by startTime
            Object.keys(shiftsByStation).forEach(station => {
                shiftsByStation[station].sort((a, b) => {
                    const order = { OPENING: 0, MID: 1, CLOSING: 2 };
                    const ta = order[(a.type||'').toUpperCase()] ?? 3;
                    const tb = order[(b.type||'').toUpperCase()] ?? 3;
                    if (ta !== tb) return ta - tb;
                    return (a.startTime||'').localeCompare(b.startTime||'');
                });
            });

            // Add placeholder MID stations if missing
            if (!shiftsByStation["MID"]) shiftsByStation["MID"] = [{ station:"MID", crewName:"Unassigned", startTime:"12:00PM", endTime:"8:00PM" }];
            if (!shiftsByStation["MID-DINING"]) shiftsByStation["MID-DINING"] = [{ station:"MID-DINING", crewName:"Unassigned", startTime:"12:00PM", endTime:"8:00PM" }];
            if (!shiftsByStation["MID-KITCHEN"]) shiftsByStation["MID-KITCHEN"] = [{ station:"MID-KITCHEN", crewName:"Unassigned", startTime:"12:00PM", endTime:"8:00PM" }];

            // Build table rows
            const hideWhenUnassigned = ["PC", "MID", "MID-DINING", "MID-KITCHEN"];
            let tableRows = '';
            stationOrder.forEach(stationName => {
                const shifts = shiftsByStation[stationName] || [];
                if (shifts.length === 0) return;

                shifts.forEach((shift, idx) => {
                    const isUnassigned = shift.crewName === "Unassigned";
                    const hideClass = hideWhenUnassigned.includes(stationName) && isUnassigned ? 'hide-if-unassigned' : '';

                    const stationCell = idx === 0
                        ? `<td rowspan="${shifts.length * 2}" class="hist-station-cell" style="text-align:left;background:#f8f9fa;">${stationName}</td>`
                        : '';

                    tableRows += `
                        <tr class="${hideClass}">
                            ${stationCell}
                            <td class="hist-name-cell">${shift.crewName}</td>
                            <td style="white-space:nowrap;">${shift.startTime}-${shift.endTime}</td>
                            <td></td><td></td><td></td><td></td><td></td>
                        </tr>
                        <tr class="hist-blank-row ${hideClass}">
                            <td colspan="7" style="padding:4px;border:1px solid #eee;"><input type="text" style="width:100%;border:none;background:transparent;font-size:12px;padding:2px;font-family:inherit;"></td>
                        </tr>`;
                });
            });

            modalHtml += `
                <div class="day-schedule" style="margin-bottom: 30px; background: #f8f9fa; padding: 20px; border-radius: 10px; border-left: 5px solid #DC0000;">
                    <!-- Screen header -->
                    <h3 class="screen-day-header" style="background: linear-gradient(135deg, #DC0000 0%, #B00000 100%); color: white; padding: 15px; border-radius: 8px; margin-bottom: 15px; font-size: 20px; text-align: center;">
                        ${day} - ${formattedDate}
                    </h3>

                    <!-- Print-only header -->
                    <div class="hist-print-header">
                        <div class="hist-print-header-date">${printDateLabel}</div>
                        <div class="hist-print-header-branch">JOLLIBEE EDSA KAMIAS</div>
                    </div>

                    <div class="hist-table-wrap" style="overflow-x:auto;">
                    <table class="hist-sched-table" style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;">
                        <thead>
                            <tr>
                                <th style="border:1px solid #000;padding:8px;text-align:left;">STATION</th>
                                <th style="border:1px solid #000;padding:8px;text-align:left;">NAME</th>
                                <th style="border:1px solid #000;padding:8px;text-align:center;">TIME</th>
                                <th style="border:1px solid #000;padding:8px;text-align:center;">15</th>
                                <th style="border:1px solid #000;padding:8px;text-align:center;">30</th>
                                <th style="border:1px solid #000;padding:8px;text-align:center;">60</th>
                                <th style="border:1px solid #000;padding:8px;text-align:center;">15</th>
                                <th style="border:1px solid #000;padding:8px;text-align:left;">SIGNATURE</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                    </div>

                    <!-- Print-only footer -->
                    <div class="hist-print-footer">
                        <table>
                            <tr>
                                <td class="bold-cell" style="width:55%;">ACKNOWLEDGE OF YOUR SCHED</td>
                                <td rowspan="6" class="yellow-cell" style="width:45%;vertical-align:middle;">BEE HAPPY! :)</td>
                            </tr>
                            <tr><td class="bold-cell red-text">ASK YOUR TL IF THERE'S CORRECTION</td></tr>
                            <tr><td class="bold-cell">DON'T BE LATE</td></tr>
                            <tr><td class="bold-cell">EXCESSIVE LATE WILL DO IR AND REPORT TO JAFRA</td></tr>
                            <tr><td class="bold-cell">PLEASE CALL STORE OR DROP MESSAGE IN OUR GC</td></tr>
                            <tr><td class="bold-cell">FOR NO CALL, MUST PRESENT A MEDICAL CERTIFICATE</td></tr>
                            <tr><td class="bold-cell red-text" colspan="2">PLEASE LONG BREAK IF SLACK</td></tr>
                            <tr><td colspan="2" class="bold-cell">REQUEST MUST BE DONE 3 DAYS PRIOR THE DAY OF THE REQUEST</td></tr>
                        </table>
                    </div>


                </div>
            `;
        });
        
        modalHtml += `
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
    } catch (e) {
        console.error("Error viewing schedule:", e);
        alert("Error loading schedule. Check console.");
    }
};

window.closeScheduleModal = function() {
    const modal = document.getElementById('scheduleModal');
    if (modal) modal.remove();
};

window.printScheduleModal = function() {
    // Get the schedule content
    const scheduleContent = document.getElementById('scheduleModalContent');
    if (!scheduleContent) return;
    
    // Create a hidden print container
    const printContainer = document.createElement('div');
    printContainer.id = 'printContainer';
    printContainer.innerHTML = scheduleContent.innerHTML;
    printContainer.style.display = 'none';
    document.body.appendChild(printContainer);
    
    // Hide everything except print container
    document.body.classList.add('printing');
    
    // Close the modal
    const modal = document.getElementById('scheduleModal');
    if (modal) modal.style.display = 'none';
    
    // Small delay to ensure DOM is ready
    setTimeout(() => {
        window.print();
        
        // Cleanup after print
        setTimeout(() => {
            document.body.classList.remove('printing');
            if (printContainer) printContainer.remove();
            if (modal) modal.remove();
        }, 100);
    }, 100);
};

// Delete schedule permanently
window.deleteSchedule = async function(scheduleId, startDate) {
    const confirmMsg = `⚠️ PERMANENTLY DELETE this schedule?\n\nWeek: ${startDate}\n\nThis action CANNOT be undone!`;
    if (!confirm(confirmMsg)) return;
    
    // Double confirmation
    const doubleConfirm = confirm("Are you ABSOLUTELY SURE? This will permanently delete the schedule from the database.");
    if (!doubleConfirm) return;
    
    try {
        await deleteDoc(doc(db, "weeklySchedules", scheduleId));
        alert("✅ Schedule deleted permanently!");
        loadHistory(); // Reload the list
    } catch (e) {
        console.error("Error deleting schedule:", e);
        alert("❌ Error deleting schedule. Check console.");
    }
};

// Restore schedule from history back to active
window.restoreSchedule = async function(scheduleId) {
    const confirm = window.confirm("Are you sure you want to restore this schedule back to active and publish it?");
    if (!confirm) return;
    
    try {
        await updateDoc(doc(db, "weeklySchedules", scheduleId), {
            archived: false,
            archivedAt: null,
            status: "published"  // Make sure it's published when restored
        });
        
        alert("✅ Schedule restored and published successfully!");
        loadHistory(); // Reload the list
    } catch (e) {
        console.error("Error restoring schedule:", e);
        alert("❌ Error restoring schedule. Check console.");
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


// Download schedule as Excel
window.downloadSchedule = async function(scheduleId) {
    if (typeof XLSX === 'undefined') {
        alert('Excel library not loaded. Please refresh the page and try again.');
        return;
    }

    try {
        const scheduleDoc = await getDoc(doc(db, "weeklySchedules", scheduleId));
        if (!scheduleDoc.exists()) {
            alert('Schedule not found.');
            return;
        }

        const scheduleData = scheduleDoc.data();
        const scheduleByDay = scheduleData.scheduleData || scheduleData;
        const startDate = scheduleData.startDate;
        
        const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        const stationOrder = [
            "SC/AGGRE", "ASSEMBLER", "CTR", "DINING", "FRY", 
            "PANTRY", "B-UP", "GRILL", "STOCKMAN", "DOORMAN", "PC"
        ];
        
        const workbook = XLSX.utils.book_new();
        let hasData = false;

        days.forEach(day => {
            const dayData = scheduleByDay[day];
            
            if (!dayData || !Array.isArray(dayData) || dayData.length === 0) {
                console.log(`No data for ${day}`);
                return;
            }

            const wsData = [];
            wsData.push([day.toUpperCase()]);
            wsData.push([`DATE: ${startDate || ''}`]);
            wsData.push([]);
            wsData.push(['STATION', 'NAME', 'TIME', '15', '30', '60', '15', 'SIGNATURE']);

            // Group assignments by station
            const stationGroups = {};
            dayData.forEach(assignment => {
                const station = assignment.station || 'Unknown';
                if (!stationGroups[station]) {
                    stationGroups[station] = [];
                }
                stationGroups[station].push(assignment);
            });

            // Process stations in order
            stationOrder.forEach(stationName => {
                const assignments = stationGroups[stationName];
                if (!assignments || assignments.length === 0) return;
                
                // First row with station name
                const firstAssignment = assignments[0];
                wsData.push([
                    stationName,
                    firstAssignment.name || '',
                    firstAssignment.time || '',
                    '', '', '', '', ''
                ]);
                
                // Remaining rows without station name
                for (let i = 1; i < assignments.length; i++) {
                    const assignment = assignments[i];
                    wsData.push([
                        '',
                        assignment.name || '',
                        assignment.time || '',
                        '', '', '', '', ''
                    ]);
                }
            });

            wsData.push([]);
            wsData.push([]);
            wsData.push(['ASK YOUR TL IF THERE\'S CORRECTION']);
            wsData.push(['DON\'T BE LATE']);
            wsData.push(['EXCESSIVE LATE WILL DO IR AND REPORT TO JAFRA']);
            wsData.push(['PLEASE CALL STORE OR SEND MESSAGE IN OUR']);
            wsData.push(['FOR NO CALL, MUST PRESENT A MEDICAL CERTIFICATE']);
            wsData.push(['REQUEST MUST BE DONE 3 DAYS PRIOR THE DAY OF THE REQUEST']);

            const ws = XLSX.utils.aoa_to_sheet(wsData);

            ws['!cols'] = [
                { wch: 18 }, { wch: 22 }, { wch: 20 },
                { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 22 }
            ];

            ws['!rows'] = [];
            for (let i = 0; i < wsData.length; i++) {
                ws['!rows'][i] = { hpt: 22 };
            }
            ws['!rows'][0] = { hpt: 28 };
            ws['!rows'][3] = { hpt: 28 };

            const range = XLSX.utils.decode_range(ws['!ref']);
            for (let R = range.s.r; R <= range.e.r; ++R) {
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                    if (!ws[cellAddress]) continue;
                    
                    if (!ws[cellAddress].s) ws[cellAddress].s = {};
                    
                    if (R === 3) {
                        ws[cellAddress].s = {
                            fill: { fgColor: { rgb: "FFD700" } },
                            font: { bold: true, sz: 12 },
                            alignment: { horizontal: "center", vertical: "center" },
                            border: {
                                top: { style: "thin" }, bottom: { style: "thin" },
                                left: { style: "thin" }, right: { style: "thin" }
                            }
                        };
                    }
                    else if (C === 0 && R > 3 && ws[cellAddress].v && ws[cellAddress].v !== '') {
                        const reminderStart = wsData.findIndex((row, idx) => idx > 3 && row[0] && row[0].includes('ASK YOUR TL'));
                        if (reminderStart === -1 || R < reminderStart) {
                            ws[cellAddress].s = {
                                fill: { fgColor: { rgb: "FFD700" } },
                                font: { bold: true, sz: 11 },
                                alignment: { horizontal: "center", vertical: "center" },
                                border: {
                                    top: { style: "thin" }, bottom: { style: "thin" },
                                    left: { style: "thin" }, right: { style: "thin" }
                                }
                            };
                        }
                    }
                    else if (R > 3 && C === 0 && ws[cellAddress].v && 
                            (ws[cellAddress].v.includes('ASK YOUR TL') || 
                             ws[cellAddress].v.includes('DON\'T BE LATE') ||
                             ws[cellAddress].v.includes('EXCESSIVE') ||
                             ws[cellAddress].v.includes('PLEASE CALL') ||
                             ws[cellAddress].v.includes('FOR NO CALL') ||
                             ws[cellAddress].v.includes('REQUEST MUST'))) {
                        ws[cellAddress].s = {
                            fill: { fgColor: { rgb: "FFD700" } },
                            font: { sz: 10 },
                            alignment: { horizontal: "left", vertical: "center" }
                        };
                    }
                }
            }

            XLSX.utils.book_append_sheet(workbook, ws, day);
            hasData = true;
        });

        if (!hasData) {
            alert('❌ No schedule data found.');
            return;
        }

        const dateStr = startDate || new Date().toISOString().split('T')[0];
        XLSX.writeFile(workbook, `weekly_schedule_${dateStr}.xlsx`, { cellStyles: true });
        
        alert('✅ Schedule downloaded successfully!');
    } catch (error) {
        console.error("Error downloading schedule:", error);
        alert('❌ Error downloading schedule: ' + error.message);
    }
};
