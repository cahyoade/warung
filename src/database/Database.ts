import * as SQLite from 'expo-sqlite';

export async function migrateDbIfNeeded(db: SQLite.SQLiteDatabase) {
  const DATABASE_VERSION = 1;
  let result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentDbVersion = result?.user_version || 0;

  // We will check for dummy data seeding before returning if already up to date
  let isUpToDate = currentDbVersion >= DATABASE_VERSION;

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

  if (__DEV__) {
    try {
      console.log('Development environment detected. Wiping database clean...');
      await db.execAsync(`
        DELETE FROM TransactionPayment;
        DELETE FROM TransactionItem;
        DELETE FROM "Transaction";
        DELETE FROM ProductPriceTier;
        DELETE FROM Product;
        DELETE FROM Customer;

        -- Reset auto-increment counters
        DELETE FROM sqlite_sequence WHERE name IN ('Product', 'Customer', '"Transaction"', 'TransactionItem', 'TransactionPayment', 'ProductPriceTier');
      `);

      console.log('Seeding fresh dummy data...');
      await db.execAsync(`
        INSERT INTO Product (name, category, barcode, basePrice, costPrice, unitOfMeasure, stockCount) VALUES
        ('Indomie Goreng', 'Food', '89686660011', 3000, 2500, 'pcs', 100),
        ('Beras Maknyus 5kg', 'Staple', '8999999111', 65000, 60000, 'sack', 20),
        ('Aqua 600ml', 'Drink', '888881111', 3000, 2000, 'bottle', 50),
        ('Telur Ayam', 'Food', NULL, 2000, 1500, 'pcs', 200),
        ('Minyak Goreng Bimoli 1L', 'Cooking', '89912345678', 18000, 15500, 'pouch', 30),
        ('Kopi Kapal Api', 'Drink', '8999999222', 1500, 1000, 'sachet', 150);
      `);
      console.log('Dummy products seeded successfully!');

      await db.execAsync(`
        INSERT INTO Customer (name, phone, accumulatedPoints) VALUES
        ('Budi', '08123456789', 50),
        ('Siti', '08987654321', 120),
        ('Pak RT', '08555555555', 0);
      `);
      console.log('Dummy customers seeded successfully!');
      
    } catch (error) {
      console.error('Failed to wipe or seed dummy data:', error);
    }
  }
}

