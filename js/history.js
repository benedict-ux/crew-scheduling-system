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
        
        // Station order
        const stationOrder = [
            "SC/AGGRE", "ASSEMBLER", "CTR", "DINING", "FRY", 
            "PANTRY", "B-UP", "TD2", "GRILL", "STOCKMAN", "DOORMAN", "GUARD"
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
            
            modalHtml += `
                <div class="day-schedule" style="margin-bottom: 30px; page-break-after: always; background: #f8f9fa; padding: 20px; border-radius: 10px; border-left: 5px solid #DC0000;">
                    <h3 style="background: linear-gradient(135deg, #DC0000 0%, #B00000 100%); color: white; padding: 15px; border-radius: 8px; margin-bottom: 15px; font-size: 20px; text-align: center;">
                        ${day} - ${formattedDate}
                    </h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <thead>
                            <tr style="background: #f8f9fa;">
                                <th style="border: 1px solid #000; padding: 8px; text-align: left;">STATION</th>
                                <th style="border: 1px solid #000; padding: 8px; text-align: left;">NAME</th>
                                <th style="border: 1px solid #000; padding: 8px; text-align: center;">TIME</th>
                                <th style="border: 1px solid #000; padding: 8px; text-align: center;">15</th>
                                <th style="border: 1px solid #000; padding: 8px; text-align: center;">30</th>
                                <th style="border: 1px solid #000; padding: 8px; text-align: center;">60</th>
                                <th style="border: 1px solid #000; padding: 8px; text-align: center;">15</th>
                                <th style="border: 1px solid #000; padding: 8px; text-align: left;">SIGNATURE</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            // Sort shifts by station order and type
            const sortedShifts = [...daySchedule].sort((a, b) => {
                const stationA = stationOrder.indexOf(a.station);
                const stationB = stationOrder.indexOf(b.station);
                if (stationA !== stationB) return stationA - stationB;
                
                const typeOrder = { "OPENING": 0, "CLOSING": 1 };
                return (typeOrder[a.type] || 2) - (typeOrder[b.type] || 2);
            });
            
            // Group by station
            let currentStation = "";
            let stationRowCount = 0;
            
            sortedShifts.forEach((shift, index) => {
                const isNewStation = shift.station !== currentStation;
                if (isNewStation) {
                    currentStation = shift.station;
                    stationRowCount = sortedShifts.filter(s => s.station === currentStation).length;
                }
                
                modalHtml += `<tr>`;
                
                if (isNewStation) {
                    modalHtml += `<td rowspan="${stationRowCount}" style="border: 1px solid #000; padding: 8px; font-weight: bold; vertical-align: top;">${shift.station}</td>`;
                }
                
                modalHtml += `
                    <td style="border: 1px solid #000; padding: 8px;">${shift.crewName}</td>
                    <td style="border: 1px solid #000; padding: 8px; text-align: center; font-size: 11px;">${shift.startTime}-${shift.endTime}</td>
                    <td style="border: 1px solid #000; padding: 8px;"></td>
                    <td style="border: 1px solid #000; padding: 8px;"></td>
                    <td style="border: 1px solid #000; padding: 8px;"></td>
                    <td style="border: 1px solid #000; padding: 8px;"></td>
                    <td style="border: 1px solid #000; padding: 8px;"></td>
                </tr>`;
            });
            
            modalHtml += `
                        </tbody>
                    </table>
                    
                    <div class="reminder-box" style="margin-top: 10px; padding: 8px; background: #fff3cd; border: 2px solid #ffc107; border-radius: 5px;">
                        <p style="margin: 3px 0; font-weight: bold; font-size: 10px;">ASK YOUR TL IF THERE'S CORRECTION</p>
                        <p style="margin: 3px 0; font-size: 10px;">DON'T BE LATE</p>
                        <p style="margin: 3px 0; font-size: 10px;">EXCESSIVE LATE WILL DO IR AND REPORT TO JAFRA</p>
                        <p style="margin: 3px 0; font-size: 10px;">PLEASE CALL STORE OR SEND MESSAGE IN OUR</p>
                        <p style="margin: 3px 0; font-size: 10px;">FOR NO CALL, MUST PRESENT A MEDICAL CERTIFICATE</p>
                        <p style="margin: 3px 0; font-size: 10px;">REQUEST MUST BE DONE 3 DAYS PRIOR THE DAY OF THE REQUEST</p>
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
