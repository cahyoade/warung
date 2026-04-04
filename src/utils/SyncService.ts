// Google Sheets requires a Google Cloud Project with the Google Sheets API enabled.
// You must supply your Android/Web Client IDs to acquire the accessToken.

import { SQLiteDatabase } from 'expo-sqlite';

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
                },
                sheets: [
                    { properties: { title: 'Transactions' } },
                    { properties: { title: 'Customers' } },
                    { properties: { title: 'Products' } },
                    { properties: { title: 'ProductPriceTiers' } }
                ]
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
     * Backup all tables to Google Sheets: Transactions, Customers, Products, ProductPriceTiers
     */
    static async backupAllToGoogleDrive(accessToken: string, db: SQLiteDatabase) {
        // 1. Create Spreadsheet with all sheets
        const spreadsheetId = await this.createBackupSpreadsheet(accessToken);

        // 2. Fetch all data
        const transactions = await db.getAllAsync('SELECT * FROM "Transaction"');
        const customers = await db.getAllAsync('SELECT * FROM Customer');
        const products = await db.getAllAsync('SELECT * FROM Product');
        const priceTiers = await db.getAllAsync('SELECT * FROM ProductPriceTier');

        // 3. Prepare headers and values
        const txnHeaders = ['ID', 'Date', 'Total Amount', 'Total Profit', 'Cash Given', 'Status', 'Customer ID', 'Sync Status', 'Is Voided'];
        const txnValues = [txnHeaders, ...transactions.map((t: any) => [t.id, t.date, t.totalAmount, t.totalProfit, t.cashGiven, t.paymentStatus, t.customerId, t.syncStatus, t.isVoided])];

        const custHeaders = ['ID', 'Name', 'Phone', 'Accumulated Points'];
        const custValues = [custHeaders, ...customers.map((c: any) => [c.id, c.name, c.phone, c.accumulatedPoints])];

        const prodHeaders = ['ID', 'Name', 'Category', 'Barcode', 'Base Price', 'Cost Price', 'Unit', 'Stock'];
        const prodValues = [prodHeaders, ...products.map((p: any) => [p.id, p.name, p.category, p.barcode, p.basePrice, p.costPrice, p.unitOfMeasure, p.stockCount])];

        const tierHeaders = ['ID', 'Product ID', 'Min Quantity', 'Price'];
        const tierValues = [tierHeaders, ...priceTiers.map((pt: any) => [pt.id, pt.productId, pt.minQuantity, pt.price])];

        // 4. Write to each sheet
        await this.appendDataToSheet(accessToken, spreadsheetId, 'Transactions', txnValues);
        await this.appendDataToSheet(accessToken, spreadsheetId, 'Customers', custValues);
        await this.appendDataToSheet(accessToken, spreadsheetId, 'Products', prodValues);
        await this.appendDataToSheet(accessToken, spreadsheetId, 'ProductPriceTiers', tierValues);

        return spreadsheetId;
    }

    /**
     * Reads all rows from a specific sheet tab in a Google Spreadsheet.
     * Returns an array of rows (each row is an array of cell values). The first row is the header.
     */
    static async readSheetData(accessToken: string, spreadsheetId: string, sheetName: string): Promise<any[][]> {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(sheetName)}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to read sheet "${sheetName}": ${text}`);
        }

        const data = await response.json();
        return data.values || [];
    }

    /**
     * Restore all tables from a Google Sheets backup. Overwrites all local data.
     * Order: Products → ProductPriceTiers → Customers → Transactions (respects FK constraints).
     */
    static async restoreAllFromGoogleDrive(accessToken: string, spreadsheetId: string, db: SQLiteDatabase) {
        // 1. Read all sheets
        const [txnRows, custRows, prodRows, tierRows] = await Promise.all([
            this.readSheetData(accessToken, spreadsheetId, 'Transactions'),
            this.readSheetData(accessToken, spreadsheetId, 'Customers'),
            this.readSheetData(accessToken, spreadsheetId, 'Products'),
            this.readSheetData(accessToken, spreadsheetId, 'ProductPriceTiers'),
        ]);

        // 2. Clear all local tables (order matters for FK constraints)
        await db.execAsync(`
            DELETE FROM TransactionPayment;
            DELETE FROM TransactionItem;
            DELETE FROM "Transaction";
            DELETE FROM ProductPriceTier;
            DELETE FROM Product;
            DELETE FROM Customer;
        `);

        // 3. Insert Products (skip header row)
        for (let i = 1; i < prodRows.length; i++) {
            const [id, name, category, barcode, basePrice, costPrice, unit, stock] = prodRows[i];
            await db.runAsync(
                'INSERT INTO Product (id, name, category, barcode, basePrice, costPrice, unitOfMeasure, stockCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [Number(id), name, category || null, barcode || null, Number(basePrice), Number(costPrice), unit, Number(stock)]
            );
        }

        // 4. Insert ProductPriceTiers
        for (let i = 1; i < tierRows.length; i++) {
            const [id, productId, minQuantity, price] = tierRows[i];
            await db.runAsync(
                'INSERT INTO ProductPriceTier (id, productId, minQuantity, price) VALUES (?, ?, ?, ?)',
                [Number(id), Number(productId), Number(minQuantity), Number(price)]
            );
        }

        // 5. Insert Customers
        for (let i = 1; i < custRows.length; i++) {
            const [id, name, phone, accumulatedPoints] = custRows[i];
            await db.runAsync(
                'INSERT INTO Customer (id, name, phone, accumulatedPoints) VALUES (?, ?, ?, ?)',
                [Number(id), name, phone || null, Number(accumulatedPoints)]
            );
        }

        // 6. Insert Transactions
        for (let i = 1; i < txnRows.length; i++) {
            const [id, date, totalAmount, totalProfit, cashGiven, status, customerId, syncStatus, isVoided] = txnRows[i];
            await db.runAsync(
                'INSERT INTO "Transaction" (id, date, totalAmount, totalProfit, cashGiven, paymentStatus, customerId, syncStatus, isVoided) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [Number(id), date, Number(totalAmount), Number(totalProfit), Number(cashGiven), status, customerId ? Number(customerId) : null, syncStatus, Number(isVoided)]
            );
        }
    }

    /**
     * Lists backup spreadsheets in the user's Google Drive (files named "Warung_Backup_*").
     */
    static async listBackupSpreadsheets(accessToken: string): Promise<{ id: string; name: string; createdTime: string }[]> {
        const query = encodeURIComponent("name contains 'Warung_Backup_' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
        const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,createdTime)&orderBy=createdTime desc&pageSize=20`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!response.ok) {
            throw new Error('Failed to list backup files from Google Drive');
        }

        const data = await response.json();
        return data.files || [];
    }
}
