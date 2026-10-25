// Video links set by the admin (table app_videos), merged over the built-in list and kept on the phone for offline use.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { VIDEO_TOPICS, mergeVideos } from '../content/videos';

const CACHE = 'ta.videos.v1';
let topics = VIDEO_TOPICS;
const subs = new Set();
const set = (rows) => { topics = mergeVideos(VIDEO_TOPICS, rows); subs.forEach((f) => f(topics)); };
export const currentVideoTopics = () => topics;

export async function loadVideoLinks() {
  try { const c = JSON.parse((await AsyncStorage.getItem(CACHE)) || 'null'); if (Array.isArray(c)) set(c); } catch (e) { /* no cache */ }
  try {
    const r = await supabase.from('app_videos').select('route,url');
    if (r.error) return;                     // offline, or step 022 not run yet: keep what we have
    set(r.data || []);
    AsyncStorage.setItem(CACHE, JSON.stringify(r.data || [])).catch(() => {});
  } catch (e) { /* keep */ }
}
export function useVideoTopics() {
  const [t, setT] = useState(topics);
  useEffect(() => { subs.add(setT); return () => { subs.delete(setT); }; }, []);
  return t;
}
