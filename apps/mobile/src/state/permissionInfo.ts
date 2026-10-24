import { Linking } from 'react-native';
import type { FeatureKey } from '@attune/design-tokens';
import type { PermissionKey } from './types';

export interface PermissionInfo {
  key: PermissionKey;
  title: string;
  why: string;
  powers: FeatureKey[];
  optional?: boolean;
  /** Android settings action that opens the right screen. Null = the app's own settings page. */
  intent: string | null;
}

/** Permissions shown in onboarding and the You tab. Order is the order they are asked. */
export const permissionList: PermissionInfo[] = [
  {
    key: 'notificationAccess',
    title: 'Notification access',
    why: 'So Attune can read incoming messages on this phone and rank them. Nothing leaves the device.',
    powers: ['notify', 'focus'],
    intent: 'android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS',
  },
  {
    key: 'postNotifications',
    title: 'Post notifications',
    why: 'So Attune can show a priority alert or a quiet digest after it ranks a real notification.',
    powers: ['notify'],
    intent: null,
  },
  {
    key: 'dndPolicy',
    title: 'Do Not Disturb access',
    why: 'So Smart Focus can switch Do Not Disturb on and off for you at the right moments.',
    powers: ['focus'],
    intent: 'android.settings.NOTIFICATION_POLICY_ACCESS_SETTINGS',
  },
  {
    key: 'usageAccess',
    title: 'Usage access',
    why: 'To read which apps were on screen and for how long, the baseline for true screen time.',
    powers: ['attention', 'focus'],
    intent: 'android.settings.USAGE_ACCESS_SETTINGS',
  },
  {
    key: 'activityRecognition',
    title: 'Activity',
    why: 'To tell whether you are still, walking or travelling, so interruptions fit the moment.',
    powers: ['focus', 'attention'],
    intent: null,
  },
  {
    key: 'calendar',
    title: 'Calendar',
    why: 'To know when you are in a class, viva or meeting. Event titles stay on this phone.',
    powers: ['focus'],
    intent: null,
  },
  {
    key: 'location',
    title: 'Location',
    why: 'To recognise places like college or the library. Without it, Wi-Fi names are used instead.',
    powers: ['focus', 'volume'],
    intent: null,
  },
  {
    key: 'microphone',
    title: 'Microphone',
    why: 'To measure room loudness for one second at a time. Audio is never recorded or stored.',
    powers: ['volume'],
    intent: null,
  },
  {
    key: 'camera',
    title: 'Camera',
    why: 'Screen time works without it, using sensors. The camera only sharpens accuracy during a short calibration.',
    powers: ['attention'],
    optional: true,
    intent: null,
  },
  {
    key: 'batteryExemption',
    title: 'Battery optimisation',
    why: 'So Android does not stop Attune in the background. It is duty-cycled to stay light.',
    powers: ['notify', 'focus', 'attention', 'volume'],
    intent: 'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
  },
  {
    key: 'keyboardEnabled',
    title: 'Keyboard',
    why: 'To turn on the Attune keyboard in Android, then choose it when you type.',
    powers: ['keyboard'],
    intent: 'android.settings.INPUT_METHOD_SETTINGS',
  },
];

/** Opens the right Android settings screen. Never throws; never claims the permission was granted. */
export async function openPermissionSettings(info: PermissionInfo): Promise<void> {
  try {
    if (info.intent) {
      await Linking.sendIntent(info.intent);
      return;
    }
  } catch {
    // fall through to app settings
  }
  try {
    await Linking.openSettings();
  } catch {
    // nothing else we can do
  }
}
