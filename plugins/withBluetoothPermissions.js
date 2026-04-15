const { withAndroidManifest } = require('expo/config-plugins');

const withBluetoothPermissions = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;

    const permissions = androidManifest.manifest['uses-permission'] || [];

    // Ensure BLUETOOTH_SCAN has neverForLocation flag
    const scanPermission = permissions.find(
      (p) => p.$['android:name'] === 'android.permission.BLUETOOTH_SCAN'
    );
    if (scanPermission) {
      scanPermission.$['android:usesPermissionFlags'] = 'neverForLocation';
      scanPermission.$['tools:targetApi'] = '31';
    } else {
      permissions.push({
        $: {
          'android:name': 'android.permission.BLUETOOTH_SCAN',
          'android:usesPermissionFlags': 'neverForLocation',
          'tools:targetApi': '31',
        },
      });
    }

    // Ensure BLUETOOTH_CONNECT has targetApi
    const connectPermission = permissions.find(
      (p) => p.$['android:name'] === 'android.permission.BLUETOOTH_CONNECT'
    );
    if (connectPermission) {
      connectPermission.$['tools:targetApi'] = '31';
    } else {
      permissions.push({
        $: {
          'android:name': 'android.permission.BLUETOOTH_CONNECT',
          'tools:targetApi': '31',
        },
      });
    }

    // Also add xmlns:tools if not present
    if (!androidManifest.manifest.$['xmlns:tools']) {
        androidManifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    androidManifest.manifest['uses-permission'] = permissions;

    return config;
  });
};

module.exports = withBluetoothPermissions;
