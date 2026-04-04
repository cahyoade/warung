import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as BackgroundFetch from 'expo-background-fetch';
import * as SQLite from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';
import { SyncService } from './SyncService';

const BACKUP_TASK_NAME = 'DAILY_CLOUD_BACKUP';
const LAST_BACKUP_KEY = 'lastBackupTimestamp';
const AUTO_BACKUP_ENABLED_KEY = 'autoBackupEnabled';

/**
 * The background task that runs the daily backup.
 * Checks if 24 hours have passed since the last backup before proceeding.
 */
TaskManager.defineTask(BACKUP_TASK_NAME, async () => {
    try {
        const enabled = await AsyncStorage.getItem(AUTO_BACKUP_ENABLED_KEY);
        if (enabled !== 'true') {
            return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // Check if 24h have passed since last backup
        const lastBackup = await AsyncStorage.getItem(LAST_BACKUP_KEY);
        if (lastBackup) {
            const elapsed = Date.now() - parseInt(lastBackup, 10);
            if (elapsed < 23 * 60 * 60 * 1000) { // Less than 23 hours
                return BackgroundFetch.BackgroundFetchResult.NoData;
            }
        }

        // Check if signed in
        const isSignedIn = GoogleSignin.hasPreviousSignIn();
        if (!isSignedIn) {
            return BackgroundFetch.BackgroundFetchResult.Failed;
        }

        const tokens = await GoogleSignin.getTokens();
        const accessToken = tokens.accessToken;

        const db = await SQLite.openDatabaseAsync('warung.db');
        await SyncService.backupAllToGoogleDrive(accessToken, db);

        await AsyncStorage.setItem(LAST_BACKUP_KEY, Date.now().toString());
        return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (error) {
        console.error('Background backup failed:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
    }
});

export class BackupScheduler {
    /**
     * Register the background fetch task for daily backup.
     */
    static async register() {
        const status = await BackgroundFetch.getStatusAsync();
        if (status === BackgroundFetch.BackgroundFetchStatus.Denied) {
            console.warn('Background fetch is denied by the system.');
            return false;
        }

        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKUP_TASK_NAME);
        if (!isRegistered) {
            await BackgroundFetch.registerTaskAsync(BACKUP_TASK_NAME, {
                minimumInterval: 60 * 60, // Check every hour; task itself decides if 24h passed
                stopOnTerminate: false,
                startOnBoot: true,
            });
        }
        return true;
    }

    /**
     * Unregister the background fetch task.
     */
    static async unregister() {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKUP_TASK_NAME);
        if (isRegistered) {
            await BackgroundFetch.unregisterTaskAsync(BACKUP_TASK_NAME);
        }
    }

    /**
     * Enable automatic daily backup.
     */
    static async enable() {
        await AsyncStorage.setItem(AUTO_BACKUP_ENABLED_KEY, 'true');
        await this.register();
    }

    /**
     * Disable automatic daily backup.
     */
    static async disable() {
        await AsyncStorage.setItem(AUTO_BACKUP_ENABLED_KEY, 'false');
        await this.unregister();
    }

    /**
     * Check if automatic backup is enabled.
     */
    static async isEnabled(): Promise<boolean> {
        const val = await AsyncStorage.getItem(AUTO_BACKUP_ENABLED_KEY);
        return val === 'true';
    }

    /**
     * Get the last backup timestamp.
     */
    static async getLastBackupTime(): Promise<string | null> {
        const ts = await AsyncStorage.getItem(LAST_BACKUP_KEY);
        return ts ? new Date(parseInt(ts, 10)).toLocaleString() : null;
    }

    /**
     * Record a successful manual backup timestamp.
     */
    static async recordBackup() {
        await AsyncStorage.setItem(LAST_BACKUP_KEY, Date.now().toString());
    }
}
