import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';

import { stopTimer, timer } from '@/lib/ui-state';

const beepSrc = require('../../assets/sounds/beep.wav');
const goSrc = require('../../assets/sounds/go.wav');

/** Invisible: plays the 3-2-1 beeps and the "go" tone while the rest timer runs, even when you leave the Today screen. */
export function TimerEngine() {
  const { on, end } = timer.use();
  const beep = useAudioPlayer(beepSrc);
  const go = useAudioPlayer(goSrc);
  const lastBeep = useRef(-1);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!on) {
      void deactivateKeepAwake('rest');
      return;
    }
    void activateKeepAwakeAsync('rest');
    lastBeep.current = -1;
    let finished = false;
    const play = (p: typeof beep) => {
      try {
        p.seekTo(0);
        p.play();
      } catch {
        /* sound is a nice-to-have */
      }
    };
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      if (left > 0 && left <= 3 && lastBeep.current !== left) {
        lastBeep.current = left;
        play(beep);
      }
      if (left <= 0 && !finished) {
        finished = true;
        play(go);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setTimeout(stopTimer, 2500);
      }
    }, 200);
    return () => {
      clearInterval(id);
      void deactivateKeepAwake('rest');
    };
  }, [on, end, beep, go]);

  return null;
}
