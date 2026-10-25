// Prayer alarm (long ringing notification) per prayer — written before the code (TDD).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAlarms, setAlarm, ALARM_SOUND, snoozeAlarm } from '../../src/lib/reminders.js';

let channels, scheduled, categories;
beforeEach(async () => {
  channels = {}; scheduled = []; categories = {};
  const AS = (await import('@react-native-async-storage/async-storage')).default;
  globalThis.__store.clear();
  globalThis.__expo = {
    channel: (id, c) => { channels[id] = c; }, category: (id, a) => { categories[id] = a; },
    scheduleNotificationAsync: (n) => { scheduled.push(n); return 'id'; },
    getPermissionsAsync: () => ({ granted: true }), requestPermissionsAsync: () => ({ granted: true }),
  };
});

test('alarm is off for every prayer at first; each prayer can be switched separately', async () => {
  assert.deepEqual(await getAlarms(), {});
  await setAlarm('fajr', true);
  await setAlarm('isha', true);
  await setAlarm('isha', false);
  assert.deepEqual(await getAlarms(), { fajr: true });
  await assert.rejects(setAlarm('sunrise', true), /not a prayer/);
});

test('our own alarm sound file is used (no copyrighted adhan)', () => {
  assert.equal(ALARM_SOUND, 'prayer_alarm.wav');
});

test('a prayer with alarm rings on the loud alarm channel with snooze; others stay normal', async () => {
  const { enableReminders } = await import('../../src/lib/reminders.js');
  await setAlarm('fajr', true);
  const r = await enableReminders({ lat: 21.4225, lng: 39.8262, label: 'মক্কা' });
  assert.ok(r.ok);
  const al = channels['prayer-alarm'];
  assert.ok(al, 'alarm channel made');
  assert.equal(al.sound, 'prayer_alarm.wav');
  assert.equal(al.audioAttributes.usage, 4, 'plays as an alarm');
  assert.ok(categories['prayer-alarm'].some((a) => a.identifier === 'snooze10'));
  const fajr = scheduled.filter((n) => /ফজর/.test(n.content.title));
  const others = scheduled.filter((n) => !/ফজর/.test(n.content.title));
  assert.ok(fajr.length >= 6 && fajr.every((n) => n.trigger.channelId === 'prayer-alarm' && n.content.sound === 'prayer_alarm.wav' && n.content.categoryIdentifier === 'prayer-alarm'));
  assert.ok(others.length >= 20 && others.every((n) => n.trigger.channelId === 'prayer' && n.content.sound === 'default'), 'every other prayer stays a normal notification');
});

test('snooze: rings again after 10 minutes with the same words', async () => {
  const t0 = Date.now();
  await snoozeAlarm({ actionIdentifier: 'snooze10', notification: { request: { content: { title: '🕌 ফজরের সময় হয়েছে', body: 'ভোর ৪:৫০' } } } });
  assert.equal(scheduled.length, 1);
  const n = scheduled[0];
  assert.equal(n.content.title, '⏰ ফজরের সময় হয়েছে');
  assert.ok(Math.abs(n.trigger.date.getTime() - (t0 + 10 * 60000)) < 5000);
  assert.equal(n.trigger.channelId, 'prayer-alarm');
  await snoozeAlarm({ actionIdentifier: 'stop', notification: { request: { content: {} } } });
  assert.equal(scheduled.length, 1, 'stop does nothing more');
});
