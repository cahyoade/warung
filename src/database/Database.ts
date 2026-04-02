import * as SQLite from 'expo-sqlite';

export async function migrateDbIfNeeded(db: SQLite.SQLiteDatabase) {
  const DATABASE_VERSION = 1;
  let result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentDbVersion = result?.user_version || 0;

  if (currentDbVersion >= DATABASE_VERSION) {
    return;
  }

  if (currentDbVersion === 0) {
    // Initial schema
    await db.execAsync(`
      PRAGMA journal_mode = 'wal';

      CREATE TABLE IF NOT EXISTS Product (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT,
        barcode TEXT,
        basePrice REAL NOT NULL,
        costPrice REAL NOT NULL,
        unitOfMeasure TEXT NOT NULL,
        stockCount REAL NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS ProductPriceTier (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        productId INTEGER NOT NULL,
        minQuantity REAL NOT NULL,
        price REAL NOT NULL,
        FOREIGN KEY (productId) REFERENCES Product(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS Customer (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT UNIQUE,
        accumulatedPoints INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS "Transaction" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        totalAmount REAL NOT NULL,
        totalProfit REAL NOT NULL,
        cashGiven REAL NOT NULL DEFAULT 0,
        paymentStatus TEXT NOT NULL, -- 'Paid' | 'Unpaid'
        customerId INTEGER,
        syncStatus TEXT DEFAULT 'Pending',
        isVoided INTEGER DEFAULT 0,
        FOREIGN KEY (customerId) REFERENCES Customer(id)
      );

      CREATE TABLE IF NOT EXISTS TransactionItem (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transactionId INTEGER NOT NULL,
        productId INTEGER NOT NULL,
        quantity REAL NOT NULL,
        unitPrice REAL NOT NULL,
        unitCost REAL NOT NULL,
        subtotal REAL NOT NULL,
        FOREIGN KEY (transactionId) REFERENCES "Transaction"(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES Product(id)
      );

      CREATE TABLE IF NOT EXISTS TransactionPayment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transactionId INTEGER NOT NULL,
        date TEXT NOT NULL,
        amount REAL NOT NULL,
        FOREIGN KEY (transactionId) REFERENCES "Transaction"(id) ON DELETE CASCADE
      );
    `);
    
    currentDbVersion = 1;
  }
  
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
