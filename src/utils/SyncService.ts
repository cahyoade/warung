// Google Sheets requires a Google Cloud Project with the Google Sheets API enabled.
// You must supply your Android/Web Client IDs to acquire the accessToken.

export class SyncService {
    
    /**
     * Creates a new Google Sheet named "Warung_Backup_[DATE]" and returns the Spreadsheet ID.
     */
    static async createBackupSpreadsheet(accessToken: string): Promise<string> {
        const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                properties: {
                    title: `Warung_Backup_${new Date().toLocaleDateString().replace(/\//g, '-')}`
                }
            })
        });

        if (!response.ok) {
            throw new Error('Failed to create Google Sheet');
        }

        const data = await response.json();
        return data.spreadsheetId;
    }

    /**
     * Appends a 2D array of strings/numbers to the Spreadsheet.
     */
    static async appendDataToSheet(accessToken: string, spreadsheetId: string, range: string, values: any[][]) {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: values
            })
        });

        if (!response.ok) {
            throw new Error('Failed to append data to Google Sheet');
        }

        return await response.json();
    }

    /**
     * High level function to export the SQLite Transactions table directly to a user's Google Drive.
     */
    static async syncTransactionsToGoogleDrive(accessToken: string, transactions: any[]) {
        // Build 2D Array for rows
        const headers = ['ID', 'Date', 'Total Amount', 'Total Profit', 'Cash Given', 'Status', 'Is Voided'];
        const values = [headers];

        for (const txn of transactions) {
            values.push([
                txn.id,
                txn.date,
                txn.totalAmount,
                txn.totalProfit,
                txn.cashGiven,
                txn.paymentStatus,
                txn.isVoided ? 'YES' : 'NO'
            ]);
        }

        // 1. Create Spreadsheet
        const sheetId = await this.createBackupSpreadsheet(accessToken);
        
        // 2. Append all rows
        await this.appendDataToSheet(accessToken, sheetId, 'Sheet1', values);

        return sheetId;
    }
}
