// Every expo-* module the lib files use; tests that need behaviour set globalThis.__expo.
const h = (name) => async (...a) => (globalThis.__expo && globalThis.__expo[name] ? globalThis.__expo[name](...a) : null);
export const getItemAsync = h('getItemAsync'); export const setItemAsync = h('setItemAsync'); export const deleteItemAsync = h('deleteItemAsync');
export const scheduleNotificationAsync = h('scheduleNotificationAsync'); export const cancelScheduledNotificationAsync = h('cancel');
export const getPermissionsAsync = h('getPermissionsAsync'); export const requestPermissionsAsync = h('requestPermissionsAsync');
export const setNotificationChannelAsync = h('channel'); export const setNotificationHandler = () => {};
export const getAllScheduledNotificationsAsync = async () => []; export const cancelAllScheduledNotificationsAsync = h('cancelAll');
export const getExpoPushTokenAsync = h('token'); export const AndroidImportance = { HIGH: 4, DEFAULT: 3, MAX: 5 };
export const SchedulableTriggerInputTypes = { DATE: 'date', DAILY: 'daily' };
export const getCurrentPositionAsync = h('position'); export const requestForegroundPermissionsAsync = h('locPerm');
export const getForegroundPermissionsAsync = h('locPerm'); export const Accuracy = { Balanced: 3 };
export const printToFileAsync = h('print'); export const shareAsync = h('share'); export const isAvailableAsync = async () => true;
export const documentDirectory = 'file:///doc/'; export const cacheDirectory = 'file:///cache/';
export const getInfoAsync = h('info'); export const readAsStringAsync = h('read'); export const writeAsStringAsync = h('write');
export const deleteAsync = h('delete'); export const makeDirectoryAsync = h('mkdir'); export const copyAsync = h('copy');
export const readDirectoryAsync = async () => []; export const EncodingType = { Base64: 'base64', UTF8: 'utf8' };
export const manipulateAsync = h('manipulate'); export const SaveFormat = { JPEG: 'jpeg' };
export default {};
