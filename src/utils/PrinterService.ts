import { BLEPrinter } from 'react-native-thermal-receipt-printer';
import { Alert } from 'react-native';

export type ReceiptData = {
    transactionId: number;
    items: {name: string, qty: number, subtotal: number}[];
    total: number;
    cashGiven: number;
    customerName?: string;
    pointsEarned?: number;
    totalPointsBalance?: number;
};

export class PrinterService {
    static buildReceiptFormat(data: ReceiptData): string {
        let printText = "================================\n";
        printText += "           WARUNG POS           \n";
        printText += "================================\n\n";
        
        printText += `Txn: #${data.transactionId}\n`;
        printText += `Date: ${new Date().toLocaleString()}\n\n`;

        data.items.forEach(item => {
            printText += `${item.name}\n`;
            printText += `  x${item.qty} ......... Rp ${item.subtotal.toLocaleString()}\n`;
        });

        printText += "\n--------------------------------\n";
        printText += `TOTAL DUE : Rp ${data.total.toLocaleString()}\n`;
        printText += `CASH PAID : Rp ${data.cashGiven.toLocaleString()}\n`;
        const change = data.cashGiven - data.total;
        printText += `CHANGE    : Rp ${(change > 0 ? change : 0).toLocaleString()}\n`;
        printText += "--------------------------------\n\n";

        if (data.customerName) {
            printText += `Customer: ${data.customerName}\n`;
            if (data.pointsEarned && data.pointsEarned > 0) {
                 printText += `Points Earned: +${data.pointsEarned}\n`;
            }
            if (data.totalPointsBalance) {
                 printText += `Total Points:  ${data.totalPointsBalance}\n`;
            }
            printText += "\n";
        }

        printText += "      Thank You For Shopping!   \n";
        printText += "================================\n\n\n"; // Trailing newlines to feed paper

        return printText;
    }

    static async printReceipt(data: ReceiptData) {
        const rawEscPosString = this.buildReceiptFormat(data);
        console.log("SENDING TO BLUETOOTH PRINTER:");
        
        try {
            // Initialize the module and print if a device was connected via Settings screen
            await BLEPrinter.init();
            
            // You can print raw strings by using printBill
            BLEPrinter.printBill(rawEscPosString, { beep: false, cut: false });
        } catch(e) {
            console.error(e);
            Alert.alert('Printer Error', 'Failed to communicate with printer. Ensure it is connected in settings.');
        }
    }
}
