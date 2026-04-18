/**
 * Pollen_SARDI - Google Apps Script Backend
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to https://script.google.com
 * 2. Create a new project
 * 3. Paste this code
 * 4. Update SHEET_ID below with your Google Sheet ID
 * 5. Deploy > New deployment > Web app
 * 6. Set "Execute as" to "Me" and "Who has access" to "Anyone"
 * 7. Copy the deployment URL and paste it in the Pollen_SARDI app settings
 */

// ===== CONFIGURATION =====
// Replace with your Google Sheet ID (from the URL)
const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID_HERE';
const SHEET_NAME = 'Transfers';

// ===== MAIN HANDLERS =====
function doGet(e) {
    return handleRequest(e);
}

function doPost(e) {
    return handleRequest(e);
}

function handleRequest(e) {
    const action = e.parameter.action;
    
    try {
        let result;
        
        switch (action) {
            case 'addTransfer':
                result = addTransfer(e);
                break;
            case 'getTransfers':
                result = getTransfers(e);
                break;
            case 'updateTransfer':
                result = updateTransfer(e);
                break;
            case 'deleteTransfer':
                result = deleteTransfer(e);
                break;
            case 'getStats':
                result = getStats();
                break;
            default:
                result = { success: false, error: 'Unknown action' };
        }
        
        return createJsonResponse(result);
    } catch (error) {
        return createJsonResponse({
            success: false,
            error: error.toString()
        });
    }
}

function createJsonResponse(data) {
    return ContentService
        .createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
}

// ===== SHEET OPERATIONS =====
function getSheet() {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    
    // Create sheet if it doesn't exist
    if (!sheet) {
        sheet = ss.insertSheet(SHEET_NAME);
        // Add headers
        const headers = [
            'transfer_id',
            'sample_id',
            'sample_type',
            'box_id',
            'box_type',
            'latitude',
            'longitude',
            'location_name',
            'transfer_date',
            'transfer_time',
            'timestamp',
            'notes',
            'user_id',
            'created_at'
        ];
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
        sheet.setFrozenRows(1);
    }
    
    return sheet;
}

// ===== API METHODS =====
function addTransfer(e) {
    const sheet = getSheet();
    const data = e.postData ? JSON.parse(e.postData.contents) : e.parameter;
    
    const transferId = 'POL-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    const timestamp = new Date().toISOString();
    
    const row = [
        transferId,
        data.sample_id || '',
        data.sample_type || 'Unknown',
        data.box_id || '',
        data.box_type || 'Unknown',
        data.latitude || '',
        data.longitude || '',
        data.location_name || '',
        data.transfer_date || new Date().toISOString().split('T')[0],
        data.transfer_time || new Date().toTimeString().split(' ')[0],
        timestamp,
        data.notes || '',
        data.user_id || '',
        timestamp
    ];
    
    sheet.appendRow(row);
    
    return {
        success: true,
        transfer_id: transferId,
        message: 'Transfer logged successfully'
    };
}

function getTransfers(e) {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
        return { success: true, data: [] };
    }
    
    const headers = data[0];
    const rows = data.slice(1);
    
    let transfers = rows.map(row => {
        const obj = {};
        headers.forEach((header, i) => {
            obj[header] = row[i];
        });
        return obj;
    });
    
    // Apply filters
    if (e.parameter.sample_id) {
        transfers = transfers.filter(t => 
            t.sample_id.toLowerCase().includes(e.parameter.sample_id.toLowerCase())
        );
    }
    
    if (e.parameter.box_id) {
        transfers = transfers.filter(t => 
            t.box_id.toLowerCase().includes(e.parameter.box_id.toLowerCase())
        );
    }
    
    if (e.parameter.from) {
        transfers = transfers.filter(t => t.transfer_date >= e.parameter.from);
    }
    
    if (e.parameter.to) {
        transfers = transfers.filter(t => t.transfer_date <= e.parameter.to);
    }
    
    // Sort by timestamp descending (newest first)
    transfers.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Limit results
    const limit = parseInt(e.parameter.limit) || 100;
    transfers = transfers.slice(0, limit);
    
    return { success: true, data: transfers };
}

function updateTransfer(e) {
    const sheet = getSheet();
    const data = e.postData ? JSON.parse(e.postData.contents) : e.parameter;
    
    if (!data.transfer_id) {
        return { success: false, error: 'transfer_id is required' };
    }
    
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const idCol = headers.indexOf('transfer_id');
    
    for (let i = 1; i < allData.length; i++) {
        if (allData[i][idCol] === data.transfer_id) {
            // Update notes column
            const notesCol = headers.indexOf('notes');
            if (notesCol !== -1 && data.notes !== undefined) {
                sheet.getRange(i + 1, notesCol + 1).setValue(data.notes);
            }
            return { success: true, message: 'Transfer updated' };
        }
    }
    
    return { success: false, error: 'Transfer not found' };
}

function deleteTransfer(e) {
    const sheet = getSheet();
    const data = e.postData ? JSON.parse(e.postData.contents) : e.parameter;
    
    if (!data.transfer_id) {
        return { success: false, error: 'transfer_id is required' };
    }
    
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const idCol = headers.indexOf('transfer_id');
    
    for (let i = 1; i < allData.length; i++) {
        if (allData[i][idCol] === data.transfer_id) {
            sheet.deleteRow(i + 1);
            return { success: true, message: 'Transfer deleted' };
        }
    }
    
    return { success: false, error: 'Transfer not found' };
}

function getStats() {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
        return {
            success: true,
            stats: {
                total: 0,
                today: 0,
                thisWeek: 0,
                thisMonth: 0,
                topBoxes: [],
                recentSamples: []
            }
        };
    }
    
    const headers = data[0];
    const rows = data.slice(1);
    const dateCol = headers.indexOf('transfer_date');
    const boxCol = headers.indexOf('box_id');
    const sampleCol = headers.indexOf('sample_id');
    
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    let todayCount = 0;
    let weekCount = 0;
    let monthCount = 0;
    const boxCounts = {};
    
    rows.forEach(row => {
        const date = row[dateCol];
        const box = row[boxCol];
        
        if (date === today) todayCount++;
        if (date >= weekAgo) weekCount++;
        if (date >= monthAgo) monthCount++;
        
        boxCounts[box] = (boxCounts[box] || 0) + 1;
    });
    
    // Top boxes
    const topBoxes = Object.entries(boxCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([box, count]) => ({ box, count }));
    
    // Recent samples
    const recentSamples = rows
        .slice(-10)
        .reverse()
        .map(row => ({
            sample: row[sampleCol],
            box: row[boxCol],
            date: row[dateCol]
        }));
    
    return {
        success: true,
        stats: {
            total: rows.length,
            today: todayCount,
            thisWeek: weekCount,
            thisMonth: monthCount,
            topBoxes: topBoxes,
            recentSamples: recentSamples
        }
    };
}

// ===== SETUP FUNCTION =====
// Run this once to initialize the sheet
function setupSheet() {
    const sheet = getSheet();
    Logger.log('Sheet setup complete: ' + sheet.getName());
}
